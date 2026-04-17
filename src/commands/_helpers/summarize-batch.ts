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
// 1. Разделяет skip vs summarize через gates (skipped собирает в общий upload-буфер).
// 2. Запускает LLM параллельно с заданной concurrency для не-skip кандидатов.
// 3. Failed помечает плейсхолдером `[failed:<reason>]` с embedding=NULL — ключевой инвариант,
//    без которого внешний while-loop ретраил бы persistent failures до исчерпания maxToProcess
//    и жёг токены.
// 4. Ok-результаты эмбеддит батчем и добавляет в общий upload-буфер.
// 5. Всё вместе (skipped + failed + ok) пишет одним вызовом storage.updateSummaryWithEmbedding,
//    который внутри открывает одну транзакцию на BATCH_SIZE (100) строк. Одна транзакция
//    на батч — защита от «частично обработанного» состояния при крэше процесса между
//    разнесёнными записями. Regression-тест: «смешанный батч → один вызов» в summarize-batch.test.ts.
export async function processSummarizeBatch(args: {
  candidates: SummarizeCandidate[];
  summarizer: Summarizer;
  embedder: TextEmbedder;
  storage: Pick<ChunkContentStorage, 'updateSummaryWithEmbedding'>;
  concurrency: number;
}): Promise<SummarizeBatchResult> {
  const { candidates, summarizer, embedder, storage, concurrency } = args;

  // Общий upload-буфер: skipped + failed + ok накапливаются сюда
  // и записываются одним вызовом updateSummaryWithEmbedding в конце.
  const updates: Array<{
    contentHash: string;
    summary: string;
    embedding: number[] | null;
  }> = [];

  let summarized = 0;
  let skipped = 0;
  let failed = 0;

  // Gate 1/2: skipped → плейсхолдер `[skipped:<reason>]`, embedding=NULL.
  const toSummarize: SummarizeCandidate[] = [];
  for (const candidate of candidates) {
    const gate = shouldSummarize(candidate.input);
    if (gate.skip) {
      skipped++;
      updates.push({
        contentHash: candidate.contentHash,
        summary: `[skipped:${gate.reason ?? 'gate'}]`,
        embedding: null,
      });
    } else {
      toSummarize.push(candidate);
    }
  }

  // Параллельные LLM-вызовы (ошибки провайдера попадают в result.summary === null).
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
  for (const r of failedResults) {
    updates.push({
      contentHash: r.hash,
      summary: `[failed:${r.result.reason ?? 'unknown'}]`,
      embedding: null,
    });
  }
  if (failed > 0) {
    console.error(
      `[FIX] marking ${failed} failed rows with [failed:*] placeholder ` +
      'to prevent infinite retry loop',
    );
  }

  // Ok → эмбеддинг батчем + дописка в upload-буфер.
  if (okResults.length > 0) {
    const texts = okResults.map((r) => r.result.summary!);
    const embeddings = await embedder.embedBatch(texts);
    for (let i = 0; i < okResults.length; i++) {
      updates.push({
        contentHash: okResults[i]!.hash,
        summary: okResults[i]!.result.summary!,
        embedding: embeddings[i]!,
      });
    }
    summarized = okResults.length;
  }

  // Единый вызов: skipped + failed + ok записываются одним storage-вызовом.
  // updateSummaryWithEmbedding внутри открывает одну транзакцию на BATCH_SIZE (100) строк,
  // поэтому для типичного rag summarize батча 50 получаем ровно одну транзакцию.
  if (updates.length > 0) {
    console.error(
      '[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for ' +
      `${updates.length} rows (ok=${summarized}, skipped=${skipped}, failed=${failed})`,
    );
    await storage.updateSummaryWithEmbedding(updates);
  }

  return { summarized, skipped, failed };
}
