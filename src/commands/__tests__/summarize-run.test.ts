// Unit-тесты на helper runSummarizeLoop.
// Проверяют пагинацию, обрыв по пустому батчу, лимит maxToProcess, onProgress.
import { describe, it, expect, vi } from 'vitest';
import type { TextEmbedder } from '../../embeddings/index.js';
import type { Summarizer } from '../../summarize/index.js';
import {
  runSummarizeLoop,
  type SummarizeRunStorage,
} from '../_helpers/summarize-run.js';

const LONG_CONTENT = 'a'.repeat(300);

function makeRow(hash: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    content_hash: hash,
    content: LONG_CONTENT,
    path: `src/${hash}.ts`,
    source_type: 'code',
    language: 'ts',
    metadata: { fragmentType: 'FUNCTION' },
    ...overrides,
  };
}

function makeEmbedder(): TextEmbedder {
  return {
    dimensions: 4,
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]),
    embedBatch: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => [0.1, 0.2, 0.3, 0.4])),
    ),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]),
  } as unknown as TextEmbedder;
}

function makeSummarizer(summary = 'generated summary'): Summarizer {
  return {
    summarize: vi.fn().mockResolvedValue({ summary }),
  };
}

describe('runSummarizeLoop', () => {
  it('обходит страницами пока getWithNullSummaryForSource не вернёт пустой батч', async () => {
    const page1 = [makeRow('h1'), makeRow('h2')];
    const page2 = [makeRow('h3')];
    const page3: ReturnType<typeof makeRow>[] = [];

    const getWithNullSummaryForSource = vi.fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);

    const storage: SummarizeRunStorage = {
      getWithNullSummaryForSource,
      updateSummaryWithEmbedding: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runSummarizeLoop({
      sourceId: 'src-1',
      chunkContentStorage: storage,
      summarizer: makeSummarizer(),
      embedder: makeEmbedder(),
      concurrency: 2,
      maxToProcess: 1000,
      fetchBatchSize: 50,
    });

    expect(getWithNullSummaryForSource).toHaveBeenCalledTimes(3);
    expect(result.processed).toBe(3);
    expect(result.summarized).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('останавливается по maxToProcess даже если в БД ещё есть кандидаты', async () => {
    const page = [makeRow('h1'), makeRow('h2'), makeRow('h3')];
    const storage: SummarizeRunStorage = {
      getWithNullSummaryForSource: vi.fn().mockResolvedValue(page),
      updateSummaryWithEmbedding: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runSummarizeLoop({
      sourceId: 'src-1',
      chunkContentStorage: storage,
      summarizer: makeSummarizer(),
      embedder: makeEmbedder(),
      concurrency: 2,
      maxToProcess: 2,
      fetchBatchSize: 2,
    });

    // fetchBatchSize зажат до min(2, remaining=2) → батч 2 строки.
    expect(result.processed).toBeLessThanOrEqual(3);
    expect(storage.getWithNullSummaryForSource).toHaveBeenCalledWith('src-1', 2);
  });

  it('onProgress вызывается после каждого батча со свежей агрегатной статистикой', async () => {
    const page1 = [makeRow('h1')];
    const page2 = [makeRow('h2')];
    const page3: ReturnType<typeof makeRow>[] = [];

    const storage: SummarizeRunStorage = {
      getWithNullSummaryForSource: vi.fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2)
        .mockResolvedValueOnce(page3),
      updateSummaryWithEmbedding: vi.fn().mockResolvedValue(undefined),
    };

    const onProgress = vi.fn();

    await runSummarizeLoop({
      sourceId: 'src-1',
      chunkContentStorage: storage,
      summarizer: makeSummarizer(),
      embedder: makeEmbedder(),
      concurrency: 1,
      maxToProcess: 100,
      fetchBatchSize: 50,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      processed: 1,
      summarized: 1,
      skipped: 0,
      failed: 0,
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      processed: 2,
      summarized: 2,
      skipped: 0,
      failed: 0,
    });
  });

  it('агрегирует skipped и failed через processSummarizeBatch', async () => {
    const page = [
      makeRow('h-skip', { content: 'tiny' }),
      makeRow('h-ok'),
      makeRow('h-fail'),
    ];
    const storage: SummarizeRunStorage = {
      getWithNullSummaryForSource: vi.fn()
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([]),
      updateSummaryWithEmbedding: vi.fn().mockResolvedValue(undefined),
    };

    const summarizer: Summarizer = {
      summarize: vi.fn()
        .mockResolvedValueOnce({ summary: 'Good' })
        .mockResolvedValueOnce({ summary: null, reason: 'http-500' }),
    };

    const result = await runSummarizeLoop({
      sourceId: 'src-1',
      chunkContentStorage: storage,
      summarizer,
      embedder: makeEmbedder(),
      concurrency: 2,
      maxToProcess: 100,
      fetchBatchSize: 50,
    });

    expect(result).toEqual({
      processed: 3,
      summarized: 1,
      skipped: 1,
      failed: 1,
    });
  });
});
