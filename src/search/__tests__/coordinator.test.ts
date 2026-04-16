import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchCoordinator } from '../coordinator.js';
import type { SearchConfig } from '../../config/index.js';
import type { TextEmbedder } from '../../embeddings/index.js';
import type {
  ChunkRow,
  ChunkStorage,
  ChunkContentStorage,
  SourceRow,
  SourceStorage,
  SourceViewRow,
  SourceViewStorage,
} from '../../storage/index.js';
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
    repo_root_path: null,
    repo_subpath: null,
    active_view_id: null,
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
    source_view_id: 'view-1',
    indexed_file_id: 'file-1',
    chunk_content_hash: 'hash',
    path: `src/${id}.ts`,
    source_type: 'code',
    start_line: 1,
    end_line: 10,
    header_path: null,
    language: 'typescript',
    ordinal: 0,
    metadata: { sourceType: 'code', startLine: 1, endLine: 10 },
    created_at: new Date(),
    // @deprecated — backward-compatible поля.
    source_id: sourceId,
    content: `content of ${id}`,
    content_hash: 'hash',
    embedding: null,
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

// --- Branch-aware: resolve sourceName -> sourceId. ---

function makeView(overrides: Partial<SourceViewRow> = {}): SourceViewRow {
  return {
    id: 'view-1',
    source_id: 'src-1',
    view_kind: 'workspace',
    ref_name: null,
    head_commit_oid: null,
    head_tree_oid: null,
    subtree_oid: null,
    dirty: false,
    snapshot_fingerprint: 'fp',
    file_count: 0,
    chunk_count: 0,
    last_seen_at: null,
    last_indexed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function createBranchAwareMocks() {
  const chunkStorage = {
    searchBm25: vi.fn().mockResolvedValue([]),
    searchVector: vi.fn().mockResolvedValue([]),
    getByIds: vi.fn().mockResolvedValue([]),
    getContentHashes: vi.fn().mockResolvedValue([]),
    resolveOccurrences: vi.fn().mockResolvedValue([]),
  } as unknown as ChunkStorage;

  const sourceStorage = {
    getAll: vi.fn().mockResolvedValue([
      makeSource({ id: 'src-karipos', name: 'karipos', active_view_id: 'view-karipos' }),
      makeSource({ id: 'src-other', name: 'other', active_view_id: 'view-other' }),
    ]),
    getByName: vi.fn().mockImplementation(async (name: string) => {
      if (name === 'karipos') {
        return makeSource({ id: 'src-karipos', name: 'karipos', active_view_id: 'view-karipos' });
      }
      return null;
    }),
  } as unknown as SourceStorage;

  const chunkContentStorage = {
    searchBm25: vi.fn().mockResolvedValue([]),
    searchVector: vi.fn().mockResolvedValue([]),
  } as unknown as ChunkContentStorage;

  const sourceViewStorage = {
    getRefView: vi.fn().mockImplementation(async (sourceId: string, _kind: string, ref: string) => {
      if (sourceId === 'src-karipos' && ref === 'main') {
        return makeView({ id: 'view-karipos-main', source_id: 'src-karipos', view_kind: 'branch', ref_name: 'main' });
      }
      return null;
    }),
  } as unknown as SourceViewStorage;

  const embedder = {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    dimensions: 3,
  } as unknown as TextEmbedder;

  const reranker = {
    rerank: vi.fn().mockResolvedValue([]),
  } as unknown as Reranker;

  return {
    chunkStorage,
    sourceStorage,
    chunkContentStorage,
    sourceViewStorage,
    embedder,
    reranker,
  };
}

function buildBranchAwareCoordinator(mocks: ReturnType<typeof createBranchAwareMocks>): SearchCoordinator {
  return new SearchCoordinator(
    mocks.chunkStorage,
    mocks.sourceStorage,
    mocks.embedder,
    defaultConfig(),
    mocks.reranker,
    mocks.chunkContentStorage,
    mocks.sourceViewStorage,
  );
}

describe('SearchCoordinator — branch-aware sourceName filter', () => {
  let mocks: ReturnType<typeof createBranchAwareMocks>;
  let coordinator: SearchCoordinator;

  beforeEach(() => {
    mocks = createBranchAwareMocks();
    coordinator = buildBranchAwareCoordinator(mocks);
  });

  it('резолвит sourceName → sourceId и ограничивает active views одним источником', async () => {
    await coordinator.search({ query: 'test', sourceName: 'karipos' });

    expect(mocks.sourceStorage.getByName).toHaveBeenCalledWith('karipos');
    expect(mocks.chunkStorage.getContentHashes).toHaveBeenCalledWith({
      sourceViewIds: ['view-karipos'],
      sourceType: undefined,
      pathPrefix: undefined,
    });
  });

  it('работает с branch-параметром после резолва sourceName', async () => {
    await coordinator.search({ query: 'test', sourceName: 'karipos', branch: 'main' });

    expect(mocks.sourceViewStorage.getRefView).toHaveBeenCalledWith('src-karipos', 'branch', 'main');
    expect(mocks.chunkStorage.getContentHashes).toHaveBeenCalledWith({
      sourceViewIds: ['view-karipos-main'],
      sourceType: undefined,
      pathPrefix: undefined,
    });
  });

  it('бросает Error при неизвестном sourceName', async () => {
    await expect(
      coordinator.search({ query: 'test', sourceName: 'no-such' }),
    ).rejects.toThrow('Source "no-such" not found');
    expect(mocks.chunkStorage.getContentHashes).not.toHaveBeenCalled();
  });

  it('бросает Error при одновременной передаче sourceId и sourceName', async () => {
    await expect(
      coordinator.search({
        query: 'test',
        sourceId: 'src-karipos',
        sourceName: 'karipos',
      }),
    ).rejects.toThrow('Provide either sourceId or sourceName, not both');
    expect(mocks.sourceStorage.getByName).not.toHaveBeenCalled();
    expect(mocks.chunkStorage.getContentHashes).not.toHaveBeenCalled();
  });

  it('без sourceName/sourceId фильтрация идёт по всем active views', async () => {
    await coordinator.search({ query: 'test' });

    expect(mocks.chunkStorage.getContentHashes).toHaveBeenCalledWith({
      sourceViewIds: ['view-karipos', 'view-other'],
      sourceType: undefined,
      pathPrefix: undefined,
    });
  });
});
