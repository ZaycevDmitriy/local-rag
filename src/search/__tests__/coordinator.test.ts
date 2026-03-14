import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchCoordinator } from '../coordinator.js';
import type { SearchConfig } from '../../config/schema.js';
import type { TextEmbedder } from '../../embeddings/types.js';
import type { ChunkStorage } from '../../storage/chunks.js';
import type { SourceStorage } from '../../storage/sources.js';
import type { SourceRow } from '../../storage/schema.js';
import type { ChunkRow } from '../../storage/schema.js';
import type { Reranker } from '../reranker/types.js';

// Фабрика мок-source.
function makeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 'src-1',
    name: 'test-source',
    type: 'local',
    path: '/test',
    git_url: null,
    git_branch: null,
    config: {},
    last_indexed_at: null,
    chunk_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Фабрика мок-chunk.
function makeChunk(id: string, sourceId = 'src-1'): ChunkRow {
  return {
    id,
    source_id: sourceId,
    content: `content of ${id}`,
    content_hash: 'hash',
    metadata: { path: `src/${id}.ts`, sourceType: 'code', startLine: 1, endLine: 10 },
    embedding: null,
    created_at: new Date(),
  };
}

// Дефолтный SearchConfig.
function defaultConfig(): SearchConfig {
  return {
    bm25Weight: 0.3,
    vectorWeight: 0.7,
    retrieveTopK: 50,
    finalTopK: 10,
    rrf: { k: 60 },
  };
}

// Мок-объекты.
function createMocks() {
  const chunkStorage = {
    searchBm25: vi.fn().mockResolvedValue([]),
    searchVector: vi.fn().mockResolvedValue([]),
    getByIds: vi.fn().mockResolvedValue([]),
  } as unknown as ChunkStorage;

  const sourceStorage = {
    getAll: vi.fn().mockResolvedValue([makeSource()]),
  } as unknown as SourceStorage;

  const embedder = {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    dimensions: 3,
  } as unknown as TextEmbedder;

  const reranker = {
    rerank: vi.fn().mockResolvedValue([]),
  } as unknown as Reranker;

  return { chunkStorage, sourceStorage, embedder, reranker };
}

describe('SearchCoordinator', () => {
  let mocks: ReturnType<typeof createMocks>;
  let coordinator: SearchCoordinator;

  beforeEach(() => {
    mocks = createMocks();
    coordinator = new SearchCoordinator(
      mocks.chunkStorage,
      mocks.sourceStorage,
      mocks.embedder,
      defaultConfig(),
      mocks.reranker,
    );
  });

  it('вызывает embedQuery с текстом запроса', async () => {
    await coordinator.search({ query: 'test query' });

    expect(mocks.embedder.embedQuery).toHaveBeenCalledWith('test query');
  });

  it('запускает BM25 и vector search параллельно', async () => {
    await coordinator.search({ query: 'test' });

    expect(mocks.chunkStorage.searchBm25).toHaveBeenCalledWith('test', 50, undefined, undefined, undefined);
    expect(mocks.chunkStorage.searchVector).toHaveBeenCalledWith([0.1, 0.2, 0.3], 50, undefined, undefined, undefined);
  });

  it('передаёт sourceId в search методы', async () => {
    await coordinator.search({ query: 'test', sourceId: 'src-1' });

    expect(mocks.chunkStorage.searchBm25).toHaveBeenCalledWith('test', 50, 'src-1', undefined, undefined);
    expect(mocks.chunkStorage.searchVector).toHaveBeenCalledWith([0.1, 0.2, 0.3], 50, 'src-1', undefined, undefined);
  });

  it('возвращает результаты в порядке реранкера', async () => {
    const chunk1 = makeChunk('c1');
    const chunk2 = makeChunk('c2');

    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([
      { id: 'c1', score: 0.8 },
      { id: 'c2', score: 0.6 },
    ]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([
      { id: 'c2', score: 0.9 },
      { id: 'c1', score: 0.7 },
    ]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk1, chunk2]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([
      { id: 'c2', score: 0.95, index: 1 },
      { id: 'c1', score: 0.85, index: 0 },
    ]);

    const response = await coordinator.search({ query: 'test' });

    expect(response.results).toHaveLength(2);
    expect(response.results[0]!.chunkId).toBe('c2');
    expect(response.results[1]!.chunkId).toBe('c1');
  });

  it('маппит sourceName из sources', async () => {
    const chunk = makeChunk('c1', 'src-1');
    vi.mocked(mocks.sourceStorage.getAll).mockResolvedValue([
      makeSource({ id: 'src-1', name: 'my-project' }),
    ]);
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([{ id: 'c1', score: 0.9, index: 0 }]);

    const response = await coordinator.search({ query: 'test' });

    expect(response.results[0]!.sourceName).toBe('my-project');
  });

  it('возвращает unknown для неизвестного source', async () => {
    const chunk = makeChunk('c1', 'unknown-src');
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([{ id: 'c1', score: 0.9, index: 0 }]);

    const response = await coordinator.search({ query: 'test' });

    expect(response.results[0]!.sourceName).toBe('unknown');
  });

  it('возвращает totalCandidates из fused results', async () => {
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([
      { id: 'c1', score: 0.8 },
      { id: 'c2', score: 0.6 },
      { id: 'c3', score: 0.4 },
    ]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([
      { id: 'c4', score: 0.7 },
    ]);

    const response = await coordinator.search({ query: 'test' });

    // 4 уникальных ID после RRF fusion.
    expect(response.totalCandidates).toBe(4);
  });

  it('обрезает snippet до 500 символов', async () => {
    const longContent = 'x'.repeat(1000);
    const chunk: ChunkRow = {
      ...makeChunk('c1'),
      content: longContent,
    };
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([{ id: 'c1', score: 0.9, index: 0 }]);

    const response = await coordinator.search({ query: 'test' });

    expect(response.results[0]!.snippet).toHaveLength(500);
  });

  it('использует кэш sources при повторных вызовах', async () => {
    const chunk = makeChunk('c1');
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([{ id: 'c1', score: 0.9, index: 0 }]);

    await coordinator.search({ query: 'first' });
    await coordinator.search({ query: 'second' });

    // getAll вызывается только один раз — второй раз из кэша.
    expect(mocks.sourceStorage.getAll).toHaveBeenCalledTimes(1);
  });

  it('использует query.topK вместо config.finalTopK', async () => {
    const chunk = makeChunk('c1');
    vi.mocked(mocks.chunkStorage.searchBm25).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.searchVector).mockResolvedValue([{ id: 'c1', score: 0.5 }]);
    vi.mocked(mocks.chunkStorage.getByIds).mockResolvedValue([chunk]);
    vi.mocked(mocks.reranker.rerank).mockResolvedValue([{ id: 'c1', score: 0.9, index: 0 }]);

    await coordinator.search({ query: 'test', topK: 5 });

    // rerank вызван с topK=5.
    expect(mocks.reranker.rerank).toHaveBeenCalledWith(
      'test',
      expect.any(Array),
      5,
    );
  });
});
