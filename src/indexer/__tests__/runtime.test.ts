import { describe, it, expect, vi, beforeEach } from 'vitest';
import type postgres from 'postgres';
import { AppConfigSchema, type SourceConfig } from '../../config/index.js';
import {
  SourceStorage,
  SourceViewStorage,
  FileBlobStorage,
  ChunkContentStorage,
  ChunkStorage,
  IndexedFileStorage,
} from '../../storage/index.js';
import { Indexer } from '../indexer.js';
import { ConsoleProgress } from '../progress.js';

// Мокируем sources module.
vi.mock('../../sources/index.js', () => ({
  cloneOrPull: vi.fn(),
  scanLocalFiles: vi.fn(),
  resolveRepoContext: vi.fn(),
  getCurrentRef: vi.fn(),
  listLocalBranches: vi.fn(),
  getHeadCommit: vi.fn(),
  getHeadTree: vi.fn(),
  getSubtreeOid: vi.fn(),
  isDirtyWorktree: vi.fn(),
  computeSnapshotFingerprint: vi.fn(),
  computeManifestHash: vi.fn(),
  isAncestor: vi.fn(),
  getCommittedDiffPaths: vi.fn(),
  getTrackedWorktreeChanges: vi.fn(),
  getUntrackedFiles: vi.fn(),
}));

import {
  cloneOrPull,
  scanLocalFiles,
  resolveRepoContext,
  getCurrentRef,
  listLocalBranches,
  getHeadCommit,
  getHeadTree,
  getSubtreeOid,
  isDirtyWorktree,
  computeSnapshotFingerprint,
  computeManifestHash,
} from '../../sources/index.js';
import {
  createIndexerRuntime,
  indexSourceFromConfig,
  type IndexerRuntime,
} from '../runtime.js';

function createConfig() {
  return AppConfigSchema.parse({
    embeddings: {
      provider: 'jina',
      jina: { apiKey: 'jina-key' },
    },
    indexing: {
      git: { cloneDir: '~/custom/repos' },
      chunkSize: { maxTokens: 256, overlap: 32 },
    },
  });
}

// Создаёт полный mock runtime с новыми storage классами.
function createRuntimeMock() {
  const sourceStorage = {
    upsertDefinition: vi.fn(),
    setActiveView: vi.fn(),
    updateLastIndexedAt: vi.fn(),
  };
  const sourceViewStorage = {
    upsertView: vi.fn(),
    deleteMissingBranchViews: vi.fn(),
    updateAfterIndex: vi.fn(),
    listBySource: vi.fn(),
    getWorkspaceView: vi.fn().mockResolvedValue(null),
    getRefView: vi.fn().mockResolvedValue(null),
    resolveDefaultViews: vi.fn(),
  };
  const fileBlobStorage = {
    upsertMany: vi.fn(),
    getByHash: vi.fn(),
    deleteOrphans: vi.fn(),
  };
  const chunkContentStorage = {
    insertBatch: vi.fn(),
    getByHashes: vi.fn(),
    getWithNullEmbedding: vi.fn(),
    updateEmbeddings: vi.fn(),
    deleteOrphans: vi.fn(),
  };
  const chunkStorage = {
    countByView: vi.fn().mockResolvedValue(0),
    insertBatch: vi.fn(),
    deleteByIndexedFileIds: vi.fn(),
  };
  const indexedFileStorage = {
    getByView: vi.fn().mockResolvedValue([]),
    upsertMany: vi.fn().mockResolvedValue([]),
    deleteByIds: vi.fn(),
    deleteByPaths: vi.fn(),
  };
  const indexer = {
    indexView: vi.fn().mockResolvedValue({
      totalFiles: 1,
      totalChunks: 5,
      newChunks: 5,
      deletedFiles: 0,
      unchangedFiles: 0,
      duration: 100,
      strategy: 'full-scan',
    }),
    // @deprecated — для обратной совместимости.
    indexSource: vi.fn(),
  };
  const progress = {
    onScanComplete: vi.fn(),
    onChangesDetected: vi.fn(),
    onChunkComplete: vi.fn(),
    onEmbedProgress: vi.fn(),
    onStoreComplete: vi.fn(),
    onComplete: vi.fn(),
    onBlobDedup: vi.fn(),
    onContentDedup: vi.fn(),
  };

  const runtime = {
    sourceStorage: sourceStorage as unknown as IndexerRuntime['sourceStorage'],
    sourceViewStorage: sourceViewStorage as unknown as IndexerRuntime['sourceViewStorage'],
    fileBlobStorage: fileBlobStorage as unknown as IndexerRuntime['fileBlobStorage'],
    chunkContentStorage: chunkContentStorage as unknown as IndexerRuntime['chunkContentStorage'],
    indexedFileStorage: indexedFileStorage as unknown as IndexerRuntime['indexedFileStorage'],
    chunkStorage: chunkStorage as unknown as IndexerRuntime['chunkStorage'],
    indexer: indexer as unknown as IndexerRuntime['indexer'],
    progress: progress as unknown as IndexerRuntime['progress'],
    cloneDir: '~/test/repos',
  } satisfies IndexerRuntime;

  return {
    sourceStorage,
    sourceViewStorage,
    chunkStorage,
    indexedFileStorage,
    indexer,
    progress,
    runtime,
  };
}

// Хелпер: настраивает git mocks для git-backed пути.
function setupGitMocks(opts: {
  repoRoot?: string;
  repoSubpath?: string | null;
  viewKind?: 'branch' | 'detached';
  refName?: string;
  headCommit?: string;
  headTree?: string;
  subtreeOid?: string | null;
  dirty?: boolean;
  branches?: string[];
} = {}) {
  const {
    repoRoot = '/test/project',
    repoSubpath = null,
    viewKind = 'branch',
    refName = 'main',
    headCommit = 'abc123def456',
    headTree = 'tree789abc012',
    subtreeOid = null,
    dirty = false,
    branches = ['main'],
  } = opts;

  vi.mocked(resolveRepoContext).mockResolvedValue({ repoRoot, repoSubpath });
  vi.mocked(getCurrentRef).mockResolvedValue({ viewKind, refName });
  vi.mocked(getHeadCommit).mockResolvedValue(headCommit);
  vi.mocked(getHeadTree).mockResolvedValue(headTree);
  vi.mocked(isDirtyWorktree).mockResolvedValue(dirty);
  vi.mocked(getSubtreeOid).mockResolvedValue(subtreeOid);
  vi.mocked(listLocalBranches).mockResolvedValue(branches);
}

// Хелпер: настраивает git mocks для non-git пути.
function setupNonGitMocks() {
  vi.mocked(resolveRepoContext).mockResolvedValue({
    repoRoot: '/test/project',
    repoSubpath: null,
  });
  vi.mocked(getCurrentRef).mockRejectedValue(new Error('not a git repo'));
}

const SCANNED_FILES = [{
  absolutePath: '/test/project/src/index.ts',
  relativePath: 'src/index.ts',
  content: 'export const value = 1;',
}];

describe('createIndexerRuntime', () => {
  it('создаёт runtime со всеми branch-aware зависимостями', () => {
    const sql = vi.fn() as unknown as postgres.Sql;
    const runtime = createIndexerRuntime(sql, createConfig());

    expect(runtime.cloneDir).toBe('~/custom/repos');
    expect(runtime.sourceStorage).toBeInstanceOf(SourceStorage);
    expect(runtime.sourceViewStorage).toBeInstanceOf(SourceViewStorage);
    expect(runtime.fileBlobStorage).toBeInstanceOf(FileBlobStorage);
    expect(runtime.chunkContentStorage).toBeInstanceOf(ChunkContentStorage);
    expect(runtime.chunkStorage).toBeInstanceOf(ChunkStorage);
    expect(runtime.indexedFileStorage).toBeInstanceOf(IndexedFileStorage);
    expect(runtime.indexer).toBeInstanceOf(Indexer);
    expect(runtime.progress).toBeInstanceOf(ConsoleProgress);
  });
});

describe('indexSourceFromConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeSnapshotFingerprint).mockReturnValue('tree:tree789abc012');
    vi.mocked(computeManifestHash).mockReturnValue('abc123hash');
  });

  it('индексирует local git-backed путь: upsert source, view, detectViewChanges, indexView, finalize', async () => {
    const sourceConfig: SourceConfig = {
      name: 'my-project',
      type: 'local',
      path: '/test/project',
      include: ['**/*.ts'],
    };
    const sourceRow = { id: 'source-1' };
    const viewRow = { id: 'view-1', source_id: 'source-1', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    setupGitMocks({ repoRoot: '/test/project', dirty: false });

    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: SCANNED_FILES,
      excludedCount: 0,
    });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    sourceViewStorage.deleteMissingBranchViews.mockResolvedValue([]);
    chunkStorage.countByView.mockResolvedValue(5);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    // Upsert source с repo_root_path.
    expect(sourceStorage.upsertDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-project',
        type: 'local',
        repoRootPath: '/test/project',
      }),
    );

    // Upsert view.
    expect(sourceViewStorage.upsertView).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        viewKind: 'branch',
        refName: 'main',
      }),
    );

    // indexView вызван (не indexSource).
    expect(indexer.indexView).toHaveBeenCalledWith(
      viewRow,
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({ strategy: 'full-scan' }),
    );

    // Branch reconciliation.
    expect(sourceViewStorage.deleteMissingBranchViews).toHaveBeenCalledWith(
      'source-1',
      ['main'],
    );

    // Finalize.
    expect(sourceViewStorage.updateAfterIndex).toHaveBeenCalled();
    expect(sourceStorage.setActiveView).toHaveBeenCalledWith('source-1', 'view-1');
  });

  it('индексирует non-git workspace: workspace view + full-scan', async () => {
    const sourceConfig: SourceConfig = {
      name: 'workspace',
      type: 'local',
      path: '/test/project',
    };
    const sourceRow = { id: 'source-2' };
    const viewRow = { id: 'view-2', source_id: 'source-2', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    setupNonGitMocks();
    vi.mocked(computeSnapshotFingerprint).mockReturnValue('workspace:abc123hash');

    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: SCANNED_FILES,
      excludedCount: 0,
    });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    chunkStorage.countByView.mockResolvedValue(3);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    // Workspace view.
    expect(sourceViewStorage.upsertView).toHaveBeenCalledWith(
      expect.objectContaining({
        viewKind: 'workspace',
        dirty: false,
      }),
    );

    // indexView с full-scan strategy.
    expect(indexer.indexView).toHaveBeenCalledWith(
      viewRow,
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({ strategy: 'full-scan' }),
    );

    // Нет branch reconciliation для non-git.
    expect(listLocalBranches).not.toHaveBeenCalled();
  });

  it('индексирует remote git-источник: clone + view resolution', async () => {
    const sourceConfig: SourceConfig = {
      name: 'remote-repo',
      type: 'git',
      url: 'https://github.com/user/repo.git',
      branch: 'develop',
    };
    const sourceRow = { id: 'source-3' };
    const viewRow = { id: 'view-3', source_id: 'source-3', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    vi.mocked(cloneOrPull).mockResolvedValue({ localPath: '/tmp/repos/repo' });
    setupGitMocks({ repoRoot: '/tmp/repos/repo', refName: 'develop', branches: ['develop'] });

    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: SCANNED_FILES,
      excludedCount: 0,
    });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    sourceViewStorage.deleteMissingBranchViews.mockResolvedValue([]);
    chunkStorage.countByView.mockResolvedValue(10);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    // Clone/pull.
    expect(cloneOrPull).toHaveBeenCalledWith(
      'https://github.com/user/repo.git',
      'develop',
      '~/test/repos',
    );

    // Source с gitUrl.
    expect(sourceStorage.upsertDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'git',
        gitUrl: 'https://github.com/user/repo.git',
      }),
    );

    // indexView вызван.
    expect(indexer.indexView).toHaveBeenCalled();
  });

  it('dirty git: fingerprint использует manifest hash', async () => {
    const sourceConfig: SourceConfig = {
      name: 'dirty-repo',
      type: 'local',
      path: '/test/project',
    };
    const sourceRow = { id: 'source-4' };
    const viewRow = { id: 'view-4', source_id: 'source-4', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    setupGitMocks({ dirty: true });
    vi.mocked(computeSnapshotFingerprint).mockReturnValue('dirty:abc123def456:abc123hash');

    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: SCANNED_FILES,
      excludedCount: 0,
    });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    sourceViewStorage.deleteMissingBranchViews.mockResolvedValue([]);
    chunkStorage.countByView.mockResolvedValue(0);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    // Manifest hash вычисляется для dirty.
    expect(computeManifestHash).toHaveBeenCalled();
    expect(computeSnapshotFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ dirty: true }),
    );

    // View с dirty=true.
    expect(sourceViewStorage.upsertView).toHaveBeenCalledWith(
      expect.objectContaining({ dirty: true }),
    );
  });

  it('stale branches удаляются при reconciliation', async () => {
    const sourceConfig: SourceConfig = {
      name: 'multi-branch',
      type: 'local',
      path: '/test/project',
    };
    const sourceRow = { id: 'source-5' };
    const viewRow = { id: 'view-5', source_id: 'source-5', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    setupGitMocks({ branches: ['main', 'develop'] });
    sourceViewStorage.deleteMissingBranchViews.mockResolvedValue(['old-view-id']);

    vi.mocked(scanLocalFiles).mockResolvedValue({ files: SCANNED_FILES, excludedCount: 0 });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    chunkStorage.countByView.mockResolvedValue(0);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    expect(sourceViewStorage.deleteMissingBranchViews).toHaveBeenCalledWith(
      'source-5',
      ['main', 'develop'],
    );
  });

  it('git subpath: передаёт repoSubpath и subtreeOid', async () => {
    const sourceConfig: SourceConfig = {
      name: 'subpath-source',
      type: 'local',
      path: '/test/monorepo/packages/core',
    };
    const sourceRow = { id: 'source-6' };
    const viewRow = { id: 'view-6', source_id: 'source-6', last_indexed_at: null };
    const {
      sourceStorage,
      sourceViewStorage,
      chunkStorage,
      indexer,
      runtime,
    } = createRuntimeMock();

    setupGitMocks({
      repoRoot: '/test/monorepo',
      repoSubpath: 'packages/core',
      subtreeOid: 'subtree123',
    });

    vi.mocked(scanLocalFiles).mockResolvedValue({ files: SCANNED_FILES, excludedCount: 0 });
    sourceStorage.upsertDefinition.mockResolvedValue(sourceRow);
    sourceViewStorage.upsertView.mockResolvedValue(viewRow);
    sourceViewStorage.deleteMissingBranchViews.mockResolvedValue([]);
    chunkStorage.countByView.mockResolvedValue(0);
    sourceStorage.setActiveView.mockResolvedValue(undefined);
    sourceStorage.updateLastIndexedAt.mockResolvedValue(undefined);
    sourceViewStorage.updateAfterIndex.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    expect(sourceStorage.upsertDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRootPath: '/test/monorepo',
        repoSubpath: 'packages/core',
      }),
    );

    expect(sourceViewStorage.upsertView).toHaveBeenCalledWith(
      expect.objectContaining({ subtreeOid: 'subtree123' }),
    );
  });

  it('ошибка git — не указан url', async () => {
    const { runtime } = createRuntimeMock();

    await expect(indexSourceFromConfig({
      name: 'broken-git',
      type: 'git',
    }, runtime)).rejects.toThrow('Не указан URL для git-источника "broken-git"');
  });

  it('ошибка local — не указан path', async () => {
    const { runtime } = createRuntimeMock();

    await expect(indexSourceFromConfig({
      name: 'broken-local',
      type: 'local',
    }, runtime)).rejects.toThrow('Не указан путь для источника "broken-local"');
  });
});
