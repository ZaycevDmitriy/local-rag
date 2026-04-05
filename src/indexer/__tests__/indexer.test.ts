import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Indexer } from '../indexer.js';
import type { ChunkDispatcher } from '../../chunks/index.js';
import type { TextEmbedder } from '../../embeddings/index.js';
import type { IndexedFileStorage, ChunkStorage, SourceRow, SourceStorage } from '../../storage/index.js';
import type { ProgressReporter } from '../progress.js';
import type { ChangeDetectionResult } from '../incremental.js';
import type { ScannedFile } from '../../sources/index.js';

// Мок detectChanges.
vi.mock('../incremental.js', () => ({
  detectChanges: vi.fn(),
}));

import { detectChanges } from '../incremental.js';

// Фабрика мок-source.
function makeSource(): SourceRow {
  return {
    id: 'src-1',
    name: 'test',
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
  };
}

// Мок-файлы.
function makeFiles(): ScannedFile[] {
  return [
    { relativePath: 'a.ts', absolutePath: '/test/a.ts', content: 'const a = 1;' },
    { relativePath: 'b.ts', absolutePath: '/test/b.ts', content: 'const b = 2;' },
  ];
}

// Мок ProgressReporter — noop.
function createProgress(): ProgressReporter {
  return {
    onScanComplete: vi.fn(),
    onChangesDetected: vi.fn(),
    onChunkComplete: vi.fn(),
    onEmbedProgress: vi.fn(),
    onStoreComplete: vi.fn(),
    onComplete: vi.fn(),
  };
}

// Моки зависимостей.
function createMocks() {
  const chunkStorage = {
    deleteByPath: vi.fn().mockResolvedValue(0),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    countBySource: vi.fn().mockResolvedValue(5),
  } as unknown as ChunkStorage;

  const sourceStorage = {
    updateAfterIndex: vi.fn().mockResolvedValue(undefined),
  } as unknown as SourceStorage;

  const embedder = {
    embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
    dimensions: 2,
  } as unknown as TextEmbedder;

  const dispatcher = {
    chunk: vi.fn().mockReturnValue([
      { sourceId: 'src-1', content: 'chunk1', contentHash: 'h1', metadata: { path: 'a.ts' } },
    ]),
  } as unknown as ChunkDispatcher;

  const indexedFileStorage = {
    deleteByPath: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
  } as unknown as IndexedFileStorage;

  return { chunkStorage, sourceStorage, embedder, dispatcher, indexedFileStorage };
}

describe('Indexer', () => {
  let mocks: ReturnType<typeof createMocks>;
  let progress: ProgressReporter;
  let indexer: Indexer;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
    progress = createProgress();
    indexer = new Indexer(
      mocks.chunkStorage,
      mocks.sourceStorage,
      mocks.embedder,
      mocks.dispatcher,
      progress,
      mocks.indexedFileStorage,
    );
  });

  it('вызывает detectChanges с правильными аргументами', async () => {
    const changes: ChangeDetectionResult = { changed: [], unchanged: 2, deleted: [] };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    const source = makeSource();
    const files = makeFiles();
    await indexer.indexSource(source, files);

    expect(detectChanges).toHaveBeenCalledWith('src-1', files, mocks.indexedFileStorage);
  });

  it('удаляет чанки и хэши для удалённых файлов', async () => {
    const changes: ChangeDetectionResult = {
      changed: [],
      unchanged: 0,
      deleted: ['old.ts', 'removed.ts'],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    await indexer.indexSource(makeSource(), []);

    expect(mocks.chunkStorage.deleteByPath).toHaveBeenCalledTimes(2);
    expect(mocks.chunkStorage.deleteByPath).toHaveBeenCalledWith('src-1', 'old.ts');
    expect(mocks.indexedFileStorage.deleteByPath).toHaveBeenCalledTimes(2);
  });

  it('удаляет старые чанки для modified файлов', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'a.ts', absolutePath: '/test/a.ts', content: 'new', hash: 'h', status: 'modified' }],
      unchanged: 0,
      deleted: [],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    await indexer.indexSource(makeSource(), makeFiles());

    // deleteByPath вызывается для modified файла.
    expect(mocks.chunkStorage.deleteByPath).toHaveBeenCalledWith('src-1', 'a.ts');
  });

  it('не удаляет чанки для added файлов', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'new.ts', absolutePath: '/test/new.ts', content: 'code', hash: 'h', status: 'added' }],
      unchanged: 0,
      deleted: [],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    await indexer.indexSource(makeSource(), makeFiles());

    // deleteByPath не вызывается для added.
    expect(mocks.chunkStorage.deleteByPath).not.toHaveBeenCalled();
  });

  it('вызывает chunk dispatcher для изменённых файлов', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'a.ts', absolutePath: '/test/a.ts', content: 'const a = 1;', hash: 'h', status: 'added' }],
      unchanged: 1,
      deleted: [],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    await indexer.indexSource(makeSource(), makeFiles());

    expect(mocks.dispatcher.chunk).toHaveBeenCalledWith({
      path: 'a.ts',
      content: 'const a = 1;',
      sourceId: 'src-1',
    });
  });

  it('генерирует эмбеддинги и вставляет чанки', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'a.ts', absolutePath: '/test/a.ts', content: 'code', hash: 'h', status: 'added' }],
      unchanged: 0,
      deleted: [],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);
    vi.mocked(mocks.embedder.embedBatch).mockResolvedValue([[0.5, 0.6]]);

    await indexer.indexSource(makeSource(), makeFiles());

    expect(mocks.embedder.embedBatch).toHaveBeenCalled();
    expect(mocks.chunkStorage.insertBatch).toHaveBeenCalledWith([
      expect.objectContaining({ embedding: [0.5, 0.6] }),
    ]);
  });

  it('обновляет хэши файлов после индексации', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'a.ts', absolutePath: '/test/a.ts', content: 'code', hash: 'abc123', status: 'added' }],
      unchanged: 0,
      deleted: [],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);

    await indexer.indexSource(makeSource(), makeFiles());

    expect(mocks.indexedFileStorage.upsert).toHaveBeenCalledWith('src-1', 'a.ts', 'abc123');
  });

  it('обновляет метаданные источника', async () => {
    const changes: ChangeDetectionResult = { changed: [], unchanged: 2, deleted: [] };
    vi.mocked(detectChanges).mockResolvedValue(changes);
    vi.mocked(mocks.chunkStorage.countBySource).mockResolvedValue(42);

    await indexer.indexSource(makeSource(), makeFiles());

    expect(mocks.sourceStorage.updateAfterIndex).toHaveBeenCalledWith('src-1', 42);
  });

  it('возвращает корректный IndexResult', async () => {
    const changes: ChangeDetectionResult = {
      changed: [{ path: 'a.ts', absolutePath: '/test/a.ts', content: 'code', hash: 'h', status: 'added' }],
      unchanged: 1,
      deleted: ['removed.ts'],
    };
    vi.mocked(detectChanges).mockResolvedValue(changes);
    vi.mocked(mocks.chunkStorage.countBySource).mockResolvedValue(10);

    const result = await indexer.indexSource(makeSource(), makeFiles());

    expect(result.totalFiles).toBe(2);
    expect(result.totalChunks).toBe(10);
    expect(result.newChunks).toBe(1);
    expect(result.deletedFiles).toBe(1);
    expect(result.unchangedFiles).toBe(1);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
