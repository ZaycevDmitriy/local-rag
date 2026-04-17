// Helper: обработка одного батча чанков для команды `rag summarize`.
// Содержит бизнес-логику, которая раньше лежала в .action() команды;
// вынесена в отдельную функцию для testability и соответствия правилу
// «commands/ — тонкие адаптеры».
import type { TextEmbedder } from '../../embeddings/index.js';
import type { ChunkContentStorage } from '../../storage/index.js';
import { shouldSummarize, type Summarizer, type SummarizerInput } from '../../summarize/index.js';
import { pMap } from '../../utils/index.js';

// Кандидат на суммаризацию, полученный из БД.
export interface SummarizeCandidate {
  contentHash: string;
  input: SummarizerInput;
}

// Результат обработки батча для агрегации логов.
export interface SummarizeBatchResult {
  summarized: number;
  skipped: number;
  failed: number;
}

// Обрабатывает один батч кандидатов:
// 1. Разделяет skip vs summarize через gates.
// 2. Skipped пишет плейсхолдером `[skipped:<reason>]` с embedding=NULL.
// 3. Запускает LLM параллельно с заданной concurrency.
// 4. Failed пишет плейсхолдером `[failed:<reason>]` с embedding=NULL — ключевой инвариант,
//    без которого loop ретраил бы persistent failures до исчерпания maxToProcess и жёг токены.
// 5. Ok-результаты пишет атомарно (summary + summary_embedding в одной транзакции).
export async function processSummarizeBatch(args: {
  candidates: SummarizeCandidate[];
  summarizer: Summarizer;
  embedder: TextEmbedder;
  storage: Pick<ChunkContentStorage, 'updateSummaryWithEmbedding'>;
  concurrency: number;
}): Promise<SummarizeBatchResult> {
  const { candidates, summarizer, embedder, storage, concurrency } = args;

  let summarized = 0;
  let skipped = 0;
  let failed = 0;

  // Разделяем skip vs summarize.
  const skippedUpdates: Array<{
    contentHash: string;
    summary: string;
    embedding: number[] | null;
  }> = [];
  const toSummarize: SummarizeCandidate[] = [];

  for (const candidate of candidates) {
    const gate = shouldSummarize(candidate.input);
    if (gate.skip) {
      skipped++;
      skippedUpdates.push({
        contentHash: candidate.contentHash,
        summary: `[skipped:${gate.reason ?? 'gate'}]`,
        embedding: null,
      });
    } else {
      toSummarize.push(candidate);
    }
  }

  if (skippedUpdates.length > 0) {
    await storage.updateSummaryWithEmbedding(skippedUpdates);
  }

  // Параллельные LLM-вызовы.
  const llmResults = await pMap(
    toSummarize,
    async (c) => ({
      hash: c.contentHash,
      result: await summarizer.summarize(c.input),
    }),
    concurrency,
  );

  const okResults = llmResults.filter((r) => r.result.summary !== null);
  const failedResults = llmResults.filter((r) => r.result.summary === null);
  failed = failedResults.length;

  // [FIX] Failed → плейсхолдер, чтобы не перевыбираться на следующей итерации.
  if (failedResults.length > 0) {
    const failedUpdates = failedResults.map((r) => ({
      contentHash: r.hash,
      summary: `[failed:${r.result.reason ?? 'unknown'}]`,
      embedding: null,
    }));
    console.error(
      `[FIX] marking ${failedUpdates.length} failed rows with [failed:*] placeholder ` +
      'to prevent infinite retry loop',
    );
    await storage.updateSummaryWithEmbedding(failedUpdates);
  }

  // Ok → атомарная запись summary + summary_embedding.
  if (okResults.length > 0) {
    const texts = okResults.map((r) => r.result.summary!);
    const embeddings = await embedder.embedBatch(texts);

    await storage.updateSummaryWithEmbedding(
      okResults.map((r, i) => ({
        contentHash: r.hash,
        summary: r.result.summary!,
        embedding: embeddings[i]!,
      })),
    );

    summarized = okResults.length;
  }

  return { summarized, skipped, failed };
}
