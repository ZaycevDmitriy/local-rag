// Regression-тесты на processSummarizeBatch — покрывают оба бага,
// найденных ревью PR #11: retry-loop на persistent failures и неатомарность записи.
import { describe, it, expect, vi } from 'vitest';
import type { TextEmbedder } from '../../embeddings/index.js';
import type { Summarizer } from '../../summarize/index.js';
import {
  processSummarizeBatch,
  type SummarizeCandidate,
} from '../_helpers/summarize-batch.js';

// Content длиннее MIN_CONTENT_LENGTH (200 символов), чтобы пройти Gate 1.
const LONG_CONTENT = 'a'.repeat(300);

// Фабрика SummarizeCandidate.
function makeCandidate(
  contentHash: string,
  overrides: Partial<SummarizeCandidate['input']> = {},
): SummarizeCandidate {
  return {
    contentHash,
    input: {
      path: `src/${contentHash}.ts`,
      kind: 'FUNCTION',
      language: 'ts',
      hasDocstring: false,
      content: LONG_CONTENT,
      ...overrides,
    },
  };
}

// Фабрика мок-embedder.
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

// Фабрика мок-storage.
type StorageCapture = Array<
  Array<{ contentHash: string; summary: string; embedding: number[] | null }>
>;

function makeStorage(): {
  updateSummaryWithEmbedding: ReturnType<typeof vi.fn>;
  captured: StorageCapture;
  } {
  const captured: StorageCapture = [];
  const updateSummaryWithEmbedding = vi.fn().mockImplementation(async (
    updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
  ) => {
    captured.push(updates);
  });
  return { updateSummaryWithEmbedding, captured };
}

describe('processSummarizeBatch', () => {
  it('skipped чанки пишутся плейсхолдером [skipped:*] с embedding=null', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn(),
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();

    // Gate 1: короткий content.
    const candidates = [
      makeCandidate('h1', { content: 'short' }),
    ];

    const result = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder: makeEmbedder(),
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 1,
    });

    expect(result).toEqual({ summarized: 0, skipped: 1, failed: 0 });
    expect(summarizer.summarize).not.toHaveBeenCalled();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual([
      {
        contentHash: 'h1',
        summary: '[skipped:content<200]',
        embedding: null,
      },
    ]);
  });

  // Regression — баг #1 из ревью PR #11: failed rows должны быть помечены
  // в БД плейсхолдером, иначе следующая итерация в команде перевыберет их
  // и сделает повторный LLM-вызов для тех же persistent failures.
  it('failed чанки пишутся плейсхолдером [failed:*] с embedding=null (fix retry-loop)', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn().mockResolvedValue({ summary: null, reason: 'http-400' }),
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();

    const candidates = [makeCandidate('h-fail')];

    const result = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder: makeEmbedder(),
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 1,
    });

    expect(result).toEqual({ summarized: 0, skipped: 0, failed: 1 });

    // Ключевое: failed row попал в storage и выбит из пула NULL-summary.
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual([
      {
        contentHash: 'h-fail',
        summary: '[failed:http-400]',
        embedding: null,
      },
    ]);
  });

  it('failed без reason пишутся как [failed:unknown]', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn().mockResolvedValue({ summary: null }),
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();

    await processSummarizeBatch({
      candidates: [makeCandidate('h-fail')],
      summarizer,
      embedder: makeEmbedder(),
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 1,
    });

    expect(captured[0]![0]!.summary).toBe('[failed:unknown]');
  });

  // Regression — баг #2 из ревью: summary и summary_embedding должны писаться
  // одной транзакцией в одном вызове updateSummaryWithEmbedding.
  it('ok-результаты пишутся одним вызовом updateSummaryWithEmbedding (атомарность)', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn()
        .mockResolvedValueOnce({ summary: 'Summary for h1' })
        .mockResolvedValueOnce({ summary: 'Summary for h2' }),
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();
    const embedder = makeEmbedder();

    const candidates = [makeCandidate('h1'), makeCandidate('h2')];

    const result = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder,
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 2,
    });

    expect(result).toEqual({ summarized: 2, skipped: 0, failed: 0 });

    // embedBatch вызывался один раз для пары ok-результатов.
    expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
    expect(embedder.embedBatch).toHaveBeenCalledWith([
      'Summary for h1',
      'Summary for h2',
    ]);

    // storage вызывался один раз — одна транзакция для ok-пары.
    expect(updateSummaryWithEmbedding).toHaveBeenCalledTimes(1);
    expect(captured[0]).toHaveLength(2);

    // summary и embedding оба non-null в одной записи.
    for (const row of captured[0]!) {
      expect(row.summary).not.toBeNull();
      expect(row.embedding).not.toBeNull();
    }
  });

  it('смешанный батч: skipped + ok + failed в правильных группах', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn()
        .mockResolvedValueOnce({ summary: 'Good summary' }) // h-ok
        .mockResolvedValueOnce({ summary: null, reason: 'timeout' }), // h-fail
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();

    const candidates = [
      makeCandidate('h-skip', { content: 'tiny' }), // Gate 1
      makeCandidate('h-ok'),
      makeCandidate('h-fail'),
    ];

    const result = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder: makeEmbedder(),
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 2,
    });

    expect(result).toEqual({ summarized: 1, skipped: 1, failed: 1 });
    expect(summarizer.summarize).toHaveBeenCalledTimes(2); // Только для ok+fail.

    // Три отдельных вызова: skipped, failed, ok.
    expect(updateSummaryWithEmbedding).toHaveBeenCalledTimes(3);

    const allWrites = captured.flat();
    const byHash = new Map(allWrites.map((w) => [w.contentHash, w]));

    expect(byHash.get('h-skip')).toEqual({
      contentHash: 'h-skip',
      summary: '[skipped:content<200]',
      embedding: null,
    });
    expect(byHash.get('h-fail')).toEqual({
      contentHash: 'h-fail',
      summary: '[failed:timeout]',
      embedding: null,
    });
    expect(byHash.get('h-ok')!.summary).toBe('Good summary');
    expect(byHash.get('h-ok')!.embedding).not.toBeNull();
  });

  it('пустой батч — no-op, нет вызовов summarizer/storage', async () => {
    const summarizer: Summarizer = { summarize: vi.fn() };
    const { updateSummaryWithEmbedding } = makeStorage();
    const embedder = makeEmbedder();

    const result = await processSummarizeBatch({
      candidates: [],
      summarizer,
      embedder,
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 1,
    });

    expect(result).toEqual({ summarized: 0, skipped: 0, failed: 0 });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(embedder.embedBatch).not.toHaveBeenCalled();
    expect(updateSummaryWithEmbedding).not.toHaveBeenCalled();
  });

  // Когда ВСЕ чанки в батче failed — storage всё равно вызывается с failed-плейсхолдерами.
  // Без этого поведения внешний while-loop в команде rag summarize повторно выбрал бы
  // те же самые хэши на следующей итерации (summary IS NULL) и ретраил LLM.
  it('весь батч failed → все пишутся с [failed:*] плейсхолдером', async () => {
    const summarizer: Summarizer = {
      summarize: vi.fn().mockResolvedValue({ summary: null, reason: 'http-500' }),
    };
    const { updateSummaryWithEmbedding, captured } = makeStorage();

    const candidates = [
      makeCandidate('h1'),
      makeCandidate('h2'),
      makeCandidate('h3'),
    ];

    const result = await processSummarizeBatch({
      candidates,
      summarizer,
      embedder: makeEmbedder(),
      storage: { updateSummaryWithEmbedding: updateSummaryWithEmbedding as (
        updates: Array<{ contentHash: string; summary: string; embedding: number[] | null }>,
      ) => Promise<void> },
      concurrency: 3,
    });

    expect(result).toEqual({ summarized: 0, skipped: 0, failed: 3 });

    expect(updateSummaryWithEmbedding).toHaveBeenCalledTimes(1);
    expect(captured[0]).toHaveLength(3);
    for (const row of captured[0]!) {
      expect(row.summary).toBe('[failed:http-500]');
      expect(row.embedding).toBeNull();
    }
  });
});
