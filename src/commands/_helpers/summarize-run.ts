// Helper: основной прогон команды `rag summarize`.
// Keyset-pagination по chunk_contents → processSummarizeBatch.
// Вынесен из команды в помощь адаптерному правилу «commands/ — тонкие адаптеры»
// и ради testability без моков Commander.
import type { TextEmbedder } from '../../embeddings/index.js';
import type { ChunkContentStorage } from '../../storage/index.js';
import type { Summarizer } from '../../summarize/index.js';
import { processSummarizeBatch } from './summarize-batch.js';
import { toSummarizerInput, type SummarizeCandidateRow } from './summarize-input.js';

// Агрегированный результат прогона (для финального лога команды).
export interface SummarizeRunResult {
  processed: number;
  summarized: number;
  skipped: number;
  failed: number;
}

// Минимальный контракт storage — только методы, нужные прогону.
// Хелпер не создаёт сам коннекта к БД и не управляет жизненным циклом.
export type SummarizeRunStorage = Pick<
  ChunkContentStorage,
  'getWithNullSummaryForSource' | 'updateSummaryWithEmbedding'
>;

// Прогоняет источник батчами до исчерпания `maxToProcess` или выхода
// `getWithNullSummaryForSource` на пустую выборку.
// onProgress вызывается после каждого батча — адаптер решает, как печатать.
export async function runSummarizeLoop(args: {
  sourceId: string;
  chunkContentStorage: SummarizeRunStorage;
  summarizer: Summarizer;
  embedder: TextEmbedder;
  concurrency: number;
  maxToProcess: number;
  fetchBatchSize: number;
  onProgress?: (stats: SummarizeRunResult) => void;
}): Promise<SummarizeRunResult> {
  const {
    sourceId,
    chunkContentStorage,
    summarizer,
    embedder,
    concurrency,
    maxToProcess,
    fetchBatchSize,
    onProgress,
  } = args;

  let processed = 0;
  let summarized = 0;
  let skipped = 0;
  let failed = 0;

  while (processed < maxToProcess) {
    const remaining = maxToProcess - processed;
    const batchSize = Math.min(fetchBatchSize, remaining);

    const rows = await chunkContentStorage.getWithNullSummaryForSource(
      sourceId,
      batchSize,
    );

    if (rows.length === 0) break;

    const candidates = rows.map((row) => ({
      contentHash: row.content_hash,
      input: toSummarizerInput(row as SummarizeCandidateRow),
    }));

    const batchResult = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder,
      storage: chunkContentStorage,
      concurrency,
    });

    summarized += batchResult.summarized;
    skipped += batchResult.skipped;
    failed += batchResult.failed;
    processed += rows.length;

    onProgress?.({ processed, summarized, skipped, failed });
  }

  return { processed, summarized, skipped, failed };
}
