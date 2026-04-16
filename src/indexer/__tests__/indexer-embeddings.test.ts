import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Indexer } from '../indexer.js';
import type { ChunkDispatcher, Chunk } from '../../chunks/index.js';
import type { TextEmbedder } from '../../embeddings/index.js';
import type {
  ChunkStorage,
  ChunkContentStorage,
  FileBlobStorage,
  IndexedFileStorage,
  SourceStorage,
  SourceViewStorage,
  SourceViewRow,
  ChunkContentRow,
  IndexedFileRow,
} from '../../storage/index.js';
import type { ProgressReporter } from '../progress.js';
import type { ChangedFile } from '../incremental.js';

// EMBED_BATCH_SIZE = 32, поэтому для проверки per-batch isolation используем >= 2 батча.
const BATCH_SIZE = 32;

function makeView(): SourceViewRow {
  return {
    id: 'view-1',
    source_id: 'src-1',
    view_kind: 'workspace',
    ref_name: null,
    head_commit_oid: null,
    head_tree_oid: null,
    subtree_oid: null,
    dirty: false,
    snapshot_fingerprint: 'fp-1',
    file_count: 0,
    chunk_count: 0,
    last_seen_at: null,
    last_indexed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeUpsertedFile(overrides: Partial<IndexedFileRow> = {}): IndexedFileRow {
  return {
    id: 'file-1',
    source_view_id: 'view-1',
    path: 'src/a.ts',
    content_hash: 'hash-a',
    indexed_at: new Date(),
    source_id: 'src-1',
    file_hash: 'hash-a',
    ...overrides,
  };
}

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/a.ts',
    content: 'const a = 1;',
    contentHash: 'hash-a',
    ...overrides,
  };
}

function makeChunk(contentHash: string, path: string): Chunk {
  return {
    id: `chunk-${contentHash}`,
    sourceId: 'src-1',
    content: `content for ${contentHash}`,
    contentHash,
    metadata: {
      path,
      sourceType: 'code',
      startLine: 1,
      endLine: 1,
    },
  };
}

function makeContentRow(hash: string): ChunkContentRow {
  return {
    content_hash: hash,
    content: `content for ${hash}`,
    embedding: null,
    created_at: new Date(),
  };
}

function createProgress(): ProgressReporter {
  return {
    onScanComplete: vi.fn(),
    onChangesDetected: vi.fn(),
    onChunkComplete: vi.fn(),
    onEmbedProgress: vi.fn(),
    onStoreComplete: vi.fn(),
    onComplete: vi.fn(),
    onBlobDedup: vi.fn(),
    onContentDedup: vi.fn(),
  };
}

// Генерируем N changedFiles + N chunks и возвращаем мок-graf.
function setupMocks(chunkCount: number) {
  const changedFiles: ChangedFile[] = [];
  const upsertedFiles: IndexedFileRow[] = [];
  const chunks: Chunk[] = [];
  const contentRows: ChunkContentRow[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const hash = `hash-${i}`;
    changedFiles.push(makeChangedFile({
      path: `src/f${i}.ts`,
      contentHash: hash,
      content: `code ${i}`,
    }));
    upsertedFiles.push(makeUpsertedFile({
      id: `file-${i}`,
      path: `src/f${i}.ts`,
      content_hash: hash,
    }));
    chunks.push(makeChunk(hash, `src/f${i}.ts`));
    contentRows.push(makeContentRow(hash));
  }

  const chunkStorage = {
    deleteByIndexedFileIds: vi.fn().mockResolvedValue(undefined),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    countByView: vi.fn().mockResolvedValue(chunkCount),
  } as unknown as ChunkStorage;

  const sourceStorage = {} as unknown as SourceStorage;
  const sourceViewStorage = {} as unknown as SourceViewStorage;

  const embedder = {
    embed: vi.fn(),
    embedBatch: vi.fn(),
    embedQuery: vi.fn(),
    dimensions: 2,
  } as unknown as TextEmbedder;

  // Диспетчер возвращает один chunk на файл (по индексу вызова).
  let chunkIdx = 0;
  const dispatcher = {
    chunk: vi.fn().mockImplementation(() => {
      const c = chunks[chunkIdx];
      chunkIdx++;
      return c ? [c] : [];
    }),
  } as unknown as ChunkDispatcher;

  const indexedFileStorage = {
    getByView: vi.fn().mockResolvedValue([]),
    upsertMany: vi.fn().mockResolvedValue(upsertedFiles),
    deleteByIds: vi.fn().mockResolvedValue(undefined),
    getChunklessFiles: vi.fn().mockResolvedValue([]),
  } as unknown as IndexedFileStorage;

  const fileBlobStorage = {
    upsertMany: vi.fn().mockResolvedValue(undefined),
    getByHash: vi.fn().mockResolvedValue(null),
  } as unknown as FileBlobStorage;

  const chunkContentStorage = {
    insertBatch: vi.fn().mockResolvedValue(undefined),
    getByHashes: vi.fn().mockResolvedValue(contentRows),
    updateEmbeddings: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChunkContentStorage;

  return {
    chunkStorage,
    sourceStorage,
    sourceViewStorage,
    embedder,
    dispatcher,
    indexedFileStorage,
    fileBlobStorage,
    chunkContentStorage,
    changedFiles,
    chunkCount,
  };
}

function createIndexer(mocks: ReturnType<typeof setupMocks>, progress: ProgressReporter): Indexer {
  return new Indexer(
    mocks.chunkStorage,
    mocks.sourceStorage,
    mocks.embedder,
    mocks.dispatcher,
    progress,
    mocks.indexedFileStorage,
    mocks.sourceViewStorage,
    mocks.fileBlobStorage,
    mocks.chunkContentStorage,
  );
}

describe('Indexer.indexView — per-batch isolation', () => {
  let progress: ProgressReporter;

  beforeEach(() => {
    vi.clearAllMocks();
    progress = createProgress();
  });

  it('один failed batch изолирован: только его тексты deferred, остальные успешны', async () => {
    // 3 батча: 32 + 32 + 1 = 65 чанков.
    const mocks = setupMocks(BATCH_SIZE * 2 + 1);
    const indexer = createIndexer(mocks, progress);

    let call = 0;
    vi.mocked(mocks.embedder.embedBatch).mockImplementation(async (texts: string[]) => {
      call++;
      // Второй batch падает и на retry тоже.
      if (call === 2 || call === 4) {
        throw new Error('provider error');
      }
      return texts.map(() => [0.1, 0.2]);
    });

    const result = await indexer.indexView(makeView(), mocks.changedFiles, [], {
      totalFileCount: mocks.changedFiles.length,
      unchangedFileCount: 0,
      strategy: 'full',
    });

    // embeddingsDeferred равен размеру упавшего batch (не всему набору).
    expect(result.embeddingsDeferred).toBe(BATCH_SIZE);
    // updateEmbeddings вызывался хотя бы один раз с не-упавшими batches.
    const updateCalls = vi.mocked(mocks.chunkContentStorage.updateEmbeddings).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    const totalUpdates = updateCalls.reduce((sum, [updates]) => sum + (updates?.length ?? 0), 0);
    // 65 - 32 (deferred) = 33 успешных.
    expect(totalUpdates).toBe(BATCH_SIZE + 1);
  });

  it('batch fail → retry success: batch не deferred', async () => {
    // 1 batch = 10 чанков.
    const mocks = setupMocks(10);
    const indexer = createIndexer(mocks, progress);

    let attempt = 0;
    vi.mocked(mocks.embedder.embedBatch).mockImplementation(async (texts: string[]) => {
      attempt++;
      if (attempt === 1) {
        throw new Error('first attempt fails');
      }
      return texts.map(() => [0.1, 0.2]);
    });

    const result = await indexer.indexView(makeView(), mocks.changedFiles, [], {
      totalFileCount: mocks.changedFiles.length,
      unchangedFileCount: 0,
      strategy: 'full',
    });

    expect(result.embeddingsDeferred).toBe(0);
    expect(mocks.embedder.embedBatch).toHaveBeenCalledTimes(2); // 1 fail + 1 retry success.
  });

  it('retry тоже падает → batch deferred, прогресс инкрементирован', async () => {
    const mocks = setupMocks(10);
    const indexer = createIndexer(mocks, progress);

    vi.mocked(mocks.embedder.embedBatch).mockRejectedValue(new Error('persistent error'));

    const result = await indexer.indexView(makeView(), mocks.changedFiles, [], {
      totalFileCount: mocks.changedFiles.length,
      unchangedFileCount: 0,
      strategy: 'full',
    });

    expect(result.embeddingsDeferred).toBe(10);
    // Прогресс инкрементирован даже при fail (UI не застрял).
    expect(progress.onEmbedProgress).toHaveBeenCalledWith(10, 10);
  });

  it('все батчи успешны → deferred=0', async () => {
    const mocks = setupMocks(BATCH_SIZE + 5);
    const indexer = createIndexer(mocks, progress);

    vi.mocked(mocks.embedder.embedBatch).mockImplementation(async (texts: string[]) =>
      texts.map(() => [0.1, 0.2]),
    );

    const result = await indexer.indexView(makeView(), mocks.changedFiles, [], {
      totalFileCount: mocks.changedFiles.length,
      unchangedFileCount: 0,
      strategy: 'full',
    });

    expect(result.embeddingsDeferred).toBe(0);
    // Два batch: первый 32, второй 5.
    expect(mocks.embedder.embedBatch).toHaveBeenCalledTimes(2);
  });
});
