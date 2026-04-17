import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Indexer } from '../indexer.js';
import type { ChunkDispatcher, Chunk } from '../../chunks/index.js';
import type { TextEmbedder } from '../../embeddings/index.js';
import type {
  ChunkStorage,
  ChunkContentStorage,
  ChunkOccurrenceInsert,
  FileBlobStorage,
  IndexedFileStorage,
  SourceStorage,
  SourceViewStorage,
  SourceViewRow,
  IndexedFileRow,
  FileBlobRow,
  ChunkContentRow,
} from '../../storage/index.js';
import type { ProgressReporter } from '../progress.js';

// Фабрика SourceViewRow.
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

// Фабрика IndexedFileRow для chunkless файлов.
function makeIndexedFile(overrides: Partial<IndexedFileRow> = {}): IndexedFileRow {
  return {
    id: 'idx-1',
    source_view_id: 'view-1',
    path: 'src/saga.ts',
    content_hash: 'h-saga',
    indexed_at: new Date(),
    source_id: 'src-1',
    file_hash: 'h-saga',
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

function makeChunk(contentHash: string, content: string, path: string): Chunk {
  return {
    id: `chunk-${contentHash}`,
    sourceId: 'src-1',
    content,
    contentHash,
    metadata: {
      path,
      sourceType: 'code',
      startLine: 1,
      endLine: 10,
    },
  };
}

function makeContentRow(contentHash: string): ChunkContentRow {
  return {
    content_hash: contentHash,
    content: 'content',
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

// Мок всех зависимостей Indexer для indexView-пути.
function createMocks() {
  const chunkStorage = {
    deleteByIndexedFileIds: vi.fn().mockResolvedValue(undefined),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    countByView: vi.fn().mockResolvedValue(0),
  } as unknown as ChunkStorage;

  const sourceStorage = {} as unknown as SourceStorage;
  const sourceViewStorage = {} as unknown as SourceViewStorage;

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
    getByHashes: vi.fn().mockResolvedValue([]),
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

describe('Indexer.indexView — repair mechanism', () => {
  let mocks: ReturnType<typeof createMocks>;
  let progress: ProgressReporter;
  let indexer: Indexer;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
    progress = createProgress();
    indexer = createIndexer(mocks, progress);
  });

  it('repair не запускается, если нет chunkless файлов (нет лишних вызовов)', async () => {
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([]);

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 0,
      unchangedFileCount: 0,
      strategy: 'incremental',
    });

    expect(mocks.indexedFileStorage.getChunklessFiles).toHaveBeenCalledWith('view-1');
    expect(mocks.fileBlobStorage.getByHash).not.toHaveBeenCalled();
    expect(mocks.dispatcher.chunk).not.toHaveBeenCalled();
    expect(result.repairedFiles).toBe(0);
  });

  it('восстанавливает chunks для chunkless файлов через dispatcher', async () => {
    const chunklessFile = makeIndexedFile({ id: 'idx-1', path: 'src/saga.ts', content_hash: 'h-saga' });
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([chunklessFile]);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(makeBlob('h-saga', 'function* mySaga() {}'));
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([
      makeChunk('chunk-h1', 'function* mySaga() {}', 'src/saga.ts'),
    ]);

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    expect(mocks.fileBlobStorage.getByHash).toHaveBeenCalledWith('h-saga');
    expect(mocks.dispatcher.chunk).toHaveBeenCalledWith({
      path: 'src/saga.ts',
      content: 'function* mySaga() {}',
      sourceId: 'src-1',
    });
    expect(mocks.chunkContentStorage.insertBatch).toHaveBeenCalledWith([
      { contentHash: 'chunk-h1', content: 'function* mySaga() {}' },
    ]);
    // chunks.insertBatch должен быть вызван с repair occurrences.
    const insertBatchCalls = vi.mocked(mocks.chunkStorage.insertBatch).mock.calls;
    const repairCall = insertBatchCalls.find((call) => {
      const items = call[0] as unknown as ChunkOccurrenceInsert[];
      return Array.isArray(items) && items.some((o) => o.indexedFileId === 'idx-1');
    });
    expect(repairCall).toBeDefined();
    expect(result.repairedFiles).toBe(1);
  });

  it('пропускает chunkless файл, если blob не найден, repair продолжается', async () => {
    const files = [
      makeIndexedFile({ id: 'idx-1', path: 'src/orphan.ts', content_hash: 'h-orphan' }),
      makeIndexedFile({ id: 'idx-2', path: 'src/ok.ts', content_hash: 'h-ok' }),
    ];
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue(files);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockImplementation(async (hash: string) => {
      if (hash === 'h-orphan') return null;
      return makeBlob('h-ok', 'const a = 1;');
    });
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([
      makeChunk('chunk-ok', 'const a = 1;', 'src/ok.ts'),
    ]);

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 2,
      unchangedFileCount: 2,
      strategy: 'incremental',
    });

    // dispatcher.chunk вызвался только для ok-файла.
    expect(mocks.dispatcher.chunk).toHaveBeenCalledTimes(1);
    expect(mocks.dispatcher.chunk).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/ok.ts' }));
    expect(result.repairedFiles).toBe(1);
  });

  it('связывает repair chunks с indexedFileId из IndexedFileRow (не через fileIdMap)', async () => {
    const chunklessFile = makeIndexedFile({ id: 'idx-xyz', path: 'src/b.ts', content_hash: 'h-b' });
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([chunklessFile]);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(makeBlob('h-b', 'code'));
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([
      makeChunk('chunk-b', 'code', 'src/b.ts'),
    ]);

    await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    const insertBatchCalls = vi.mocked(mocks.chunkStorage.insertBatch).mock.calls;
    const repairOccurrence = insertBatchCalls
      .flatMap((call) => (Array.isArray(call[0]) ? (call[0] as unknown as ChunkOccurrenceInsert[]) : []))
      .find((o) => o.chunkContentHash === 'chunk-b');
    expect(repairOccurrence).toBeDefined();
    expect(repairOccurrence!.indexedFileId).toBe('idx-xyz');
    expect(repairOccurrence!.sourceViewId).toBe('view-1');
  });

  it('пропускает файл, если dispatcher вернул пустой массив chunks', async () => {
    const chunklessFile = makeIndexedFile({ id: 'idx-1', path: 'src/empty.ts', content_hash: 'h-empty' });
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([chunklessFile]);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(makeBlob('h-empty', ''));
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([]);

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    // Repair не должен создавать chunk occurrences.
    const insertBatchCalls = vi.mocked(mocks.chunkStorage.insertBatch).mock.calls;
    const hasRepairOccurrence = insertBatchCalls.some((call) => {
      const items = call[0] as unknown as ChunkOccurrenceInsert[];
      return Array.isArray(items) && items.some((o) => o.indexedFileId === 'idx-1');
    });
    expect(hasRepairOccurrence).toBe(false);
    expect(result.repairedFiles).toBe(0);
  });

  it('repair content hashes добавляются в embedding-проход', async () => {
    const chunklessFile = makeIndexedFile({ id: 'idx-1', path: 'src/saga.ts', content_hash: 'h-saga' });
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([chunklessFile]);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(makeBlob('h-saga', 'code'));
    vi.mocked(mocks.dispatcher.chunk).mockReturnValue([
      makeChunk('chunk-repair', 'code', 'src/saga.ts'),
    ]);
    // Возвращаем chunk_contents row с NULL embedding, чтобы проверить, что embedder вызван.
    vi.mocked(mocks.chunkContentStorage.getByHashes).mockResolvedValue([
      { ...makeContentRow('chunk-repair'), embedding: null },
    ]);
    vi.mocked(mocks.embedder.embedBatch).mockResolvedValue([[0.5, 0.6]]);

    await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    expect(mocks.chunkContentStorage.getByHashes).toHaveBeenCalledWith(['chunk-repair']);
    expect(mocks.embedder.embedBatch).toHaveBeenCalled();
    expect(mocks.chunkContentStorage.updateEmbeddings).toHaveBeenCalledWith([
      { contentHash: 'chunk-repair', embedding: [0.5, 0.6] },
    ]);
  });

  it('дедуплицирует repair chunks с одинаковым contentHash', async () => {
    const files = [
      makeIndexedFile({ id: 'idx-1', path: 'src/a.ts', content_hash: 'h-a' }),
      makeIndexedFile({ id: 'idx-2', path: 'src/b.ts', content_hash: 'h-b' }),
    ];
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue(files);
    vi.mocked(mocks.fileBlobStorage.getByHash).mockImplementation(async (hash: string) =>
      makeBlob(hash, 'same content'),
    );
    // Оба файла чанкуются в одинаковый contentHash.
    vi.mocked(mocks.dispatcher.chunk).mockImplementation((fc) => [
      makeChunk('chunk-shared', 'same content', fc.path),
    ]);

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 2,
      unchangedFileCount: 2,
      strategy: 'incremental',
    });

    // insertBatch на chunk_contents — ровно один раз с одной записью.
    const contentInsertCalls = vi.mocked(mocks.chunkContentStorage.insertBatch).mock.calls;
    const repairContentInsert = contentInsertCalls.find((call) =>
      Array.isArray(call[0])
      && call[0].length === 1
      && call[0][0]?.contentHash === 'chunk-shared',
    );
    expect(repairContentInsert).toBeDefined();
    expect(result.repairedFiles).toBe(2);
  });

  it('ChanglessFiles обрабатывается чанками с разными путями, хэши не мешают друг другу', async () => {
    vi.mocked(mocks.indexedFileStorage.getChunklessFiles).mockResolvedValue([
      makeIndexedFile({ id: 'idx-1', path: 'src/a.ts', content_hash: 'h-a' }),
    ]);
    // Dispatcher бросает ошибку для этого файла.
    vi.mocked(mocks.fileBlobStorage.getByHash).mockResolvedValue(makeBlob('h-a', 'code'));
    vi.mocked(mocks.dispatcher.chunk).mockImplementation(() => {
      throw new Error('chunker crashed');
    });

    const result = await indexer.indexView(makeView(), [], [], {
      totalFileCount: 1,
      unchangedFileCount: 1,
      strategy: 'incremental',
    });

    // При ошибке dispatcher repair для файла пропускается без обрыва всего indexView.
    expect(result.repairedFiles).toBe(0);
  });
});
