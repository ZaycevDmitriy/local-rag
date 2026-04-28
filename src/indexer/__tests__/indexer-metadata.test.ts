import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../indexer.js';
import type { Chunk, ChunkDispatcher } from '../../chunks/index.js';
import type { TextEmbedder } from '../../embeddings/index.js';
import type {
  ChunkContentRow,
  ChunkContentStorage,
  ChunkOccurrenceInsert,
  ChunkStorage,
  FileBlobRow,
  FileBlobStorage,
  IndexedFileRow,
  IndexedFileStorage,
  SourceStorage,
  SourceViewRow,
  SourceViewStorage,
} from '../../storage/index.js';
import type { ChangedFile } from '../incremental.js';
import type { ProgressReporter } from '../progress.js';

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
    snapshot_fingerprint: 'fp-1',
    file_count: 0,
    chunk_count: 0,
    last_seen_at: null,
    last_indexed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/Foo.kt',
    content: 'class Foo { fun bar() {} }',
    contentHash: 'file-hash-1',
    ...overrides,
  };
}

function makeIndexedFile(overrides: Partial<IndexedFileRow> = {}): IndexedFileRow {
  return {
    id: 'file-1',
    source_view_id: 'view-1',
    path: 'src/Foo.kt',
    content_hash: 'file-hash-1',
    indexed_at: new Date(),
    source_id: 'src-1',
    file_hash: 'file-hash-1',
    ...overrides,
  };
}

function makeBlob(contentHash: string, content: string): FileBlobRow {
  return {
    content_hash: contentHash,
    content,
    byte_size: Buffer.byteLength(content, 'utf-8'),
    created_at: new Date(),
  };
}

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 'chunk-1',
    sourceId: 'src-1',
    content: 'fun bar() {}',
    contentHash: 'chunk-hash-1',
    metadata: {
      path: 'src/Foo.kt',
      sourceType: 'code',
      startLine: 10,
      endLine: 12,
      language: 'kotlin',
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
    },
    ...overrides,
  };
}

function makeContentRow(contentHash: string): ChunkContentRow {
  return {
    content_hash: contentHash,
    content: 'fun bar() {}',
    embedding: [0.1, 0.2],
    summary: null,
    summary_embedding: null,
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

function createMocks() {
  const chunkStorage = {
    deleteByIndexedFileIds: vi.fn().mockResolvedValue(undefined),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    countByView: vi.fn().mockResolvedValue(1),
  } as unknown as ChunkStorage;

  const sourceStorage = {} as SourceStorage;
  const sourceViewStorage = {} as SourceViewStorage;

  const embedder = {
    embed: vi.fn(),
    embedBatch: vi.fn().mockResolvedValue([]),
    embedQuery: vi.fn(),
    dimensions: 2,
  } as unknown as TextEmbedder;

  const dispatcher = {
    chunk: vi.fn().mockReturnValue([]),
  } as unknown as ChunkDispatcher;

  const indexedFileStorage = {
    getByView: vi.fn().mockResolvedValue([]),
    upsertMany: vi.fn().mockResolvedValue([]),
    deleteByIds: vi.fn().mockResolvedValue(undefined),
    getChunklessFiles: vi.fn().mockResolvedValue([]),
  } as unknown as IndexedFileStorage;

  const fileBlobStorage = {
    upsertMany: vi.fn().mockResolvedValue(undefined),
    getByHash: vi.fn().mockResolvedValue(null),
  } as unknown as FileBlobStorage;

  const chunkContentStorage = {
    insertBatch: vi.fn().mockResolvedValue(undefined),
    getByHashes: vi.fn().mockResolvedValue([makeContentRow('chunk-hash-1')]),
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
  };
}

function createIndexer(mocks: ReturnType<typeof createMocks>, progress: ProgressReporter): Indexer {
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

function findOccurrenceByFileId(
  insertBatchCalls: Array<[ChunkOccurrenceInsert[]]>,
  indexedFileId: string,
): ChunkOccurrenceInsert {
  for (const [items] of insertBatchCalls) {
    const found = items.find((item) => item.indexedFileId === indexedFileId);
    if (found) return found;
  }

  throw new Error(`Occurrence not found for indexedFileId=${indexedFileId}`);
}

describe('Indexer.indexView — chunk metadata persistence', () => {
  let mocks: ReturnType<typeof createMocks>;
  let progress: ProgressReporter;
  let indexer: Indexer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks = createMocks();
    progress = createProgress();
    indexer = createIndexer(mocks, progress);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('main path пишет metadata.fqn и fragmentType в chunk occurrence', async () => {
    const changedFile = makeChangedFile();
    vi.mocked(mocks.indexedFileStorage.upsertMany).mockResolvedValue([
      makeIndexedFile({ id: 'file-main' }),
    ]);
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([makeChunk()]);

    await indexer.indexView(makeView(), [changedFile], [], {
      totalFileCount: 1,
      unchangedFileCount: 0,
      strategy: 'full',
    });

    const occurrence = findOccurrenceByFileId(
      vi.mocked(mocks.chunkStorage.insertBatch).mock.calls as Array<[ChunkOccurrenceInsert[]]>,
      'file-main',
    );

    expect(occurrence.metadata).toEqual({
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
    });
  });

  it('repair path пишет metadata.fqn и fragmentType через тот же occurrence helper', async () => {
    const chunklessFile = makeIndexedFile({ id: 'file-repair' });
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([chunklessFile]);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(
      makeBlob('file-hash-1', 'class Foo { fun bar() {} }'),
    );
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([makeChunk()]);

    await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    const occurrence = findOccurrenceByFileId(
      vi.mocked(mocks.chunkStorage.insertBatch).mock.calls as Array<[ChunkOccurrenceInsert[]]>,
      'file-repair',
    );

    expect(occurrence.metadata).toEqual({
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
    });
  });
});
