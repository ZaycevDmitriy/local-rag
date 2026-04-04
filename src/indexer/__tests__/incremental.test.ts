import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { detectChanges, detectViewChanges, type ViewChangeDetectionParams } from '../incremental.js';
import type { IndexedFileStorage, SourceViewRow } from '../../storage/index.js';
import type { ScannedFile } from '../../sources/index.js';

// Мокируем git-функции.
vi.mock('../../sources/index.js', () => ({
  isAncestor: vi.fn(),
  getCommittedDiffPaths: vi.fn(),
  getTrackedWorktreeChanges: vi.fn(),
  getUntrackedFiles: vi.fn(),
}));

import { isAncestor, getCommittedDiffPaths, getTrackedWorktreeChanges, getUntrackedFiles } from '../../sources/index.js';

// Вычисляет SHA-256 хэш строки (дублируем для тестов).
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// Создаёт мок IndexedFileStorage.
function createStorageMock(
  rows: Array<{ path: string; file_hash: string }>,
): IndexedFileStorage {
  return {
    getBySource: vi.fn().mockResolvedValue(
      rows.map((r) => ({
        id: `id-${r.path}`,
        source_id: 'source-1',
        path: r.path,
        file_hash: r.file_hash,
        indexed_at: new Date(),
      })),
    ),
    upsert: vi.fn(),
    deleteBySource: vi.fn(),
    deleteByPath: vi.fn(),
  } as unknown as IndexedFileStorage;
}

// Создаёт ScannedFile с заданным контентом.
function makeFile(relativePath: string, content: string): ScannedFile {
  return {
    absolutePath: `/base/${relativePath}`,
    relativePath,
    content,
  };
}

describe('detectChanges', () => {
  it('все файлы новые — все попадают в changed со статусом added', async () => {
    const storage = createStorageMock([]);
    const files = [
      makeFile('a.md', 'content A'),
      makeFile('b.md', 'content B'),
    ];

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(2);
    expect(result.changed[0]).toMatchObject({
      path: 'a.md',
      absolutePath: '/base/a.md',
      content: 'content A',
      hash: sha256('content A'),
      status: 'added',
    });
    expect(result.changed[1]).toMatchObject({ path: 'b.md', status: 'added' });
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toEqual([]);
  });

  it('файлы не изменились — все в unchanged', async () => {
    const files = [
      makeFile('a.md', 'content A'),
      makeFile('b.md', 'content B'),
    ];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content A') },
      { path: 'b.md', file_hash: sha256('content B') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(2);
    expect(result.deleted).toEqual([]);
  });

  it('один файл изменился — статус modified', async () => {
    const files = [
      makeFile('a.md', 'new content A'),
      makeFile('b.md', 'content B'),
    ];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('old content A') },
      { path: 'b.md', file_hash: sha256('content B') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({
      path: 'a.md',
      status: 'modified',
      hash: sha256('new content A'),
    });
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toEqual([]);
  });

  it('файл удалён — попадает в deleted', async () => {
    const files = [makeFile('a.md', 'content A')];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content A') },
      { path: 'deleted.md', file_hash: sha256('old content') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toEqual(['deleted.md']);
  });

  it('смешанный сценарий: added + modified + unchanged + deleted', async () => {
    const files = [
      makeFile('unchanged.md', 'same content'),
      makeFile('modified.md', 'new content'),
      makeFile('added.md', 'brand new'),
    ];

    const storage = createStorageMock([
      { path: 'unchanged.md', file_hash: sha256('same content') },
      { path: 'modified.md', file_hash: sha256('old content') },
      { path: 'deleted.md', file_hash: sha256('will be deleted') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.unchanged).toBe(1);

    const changedPaths = result.changed.map((c) => c.path);
    expect(changedPaths).toContain('modified.md');
    expect(changedPaths).toContain('added.md');
    expect(result.changed.find((c) => c.path === 'modified.md')?.status).toBe('modified');
    expect(result.changed.find((c) => c.path === 'added.md')?.status).toBe('added');

    expect(result.deleted).toEqual(['deleted.md']);
  });

  it('пустой список файлов — все сохранённые попадают в deleted', async () => {
    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content') },
      { path: 'b.md', file_hash: sha256('content') },
    ]);

    const result = await detectChanges('source-1', [], storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toHaveLength(2);
    expect(result.deleted).toContain('a.md');
    expect(result.deleted).toContain('b.md');
  });
});

// --- Тесты detectViewChanges (branch-aware). ---

// Мок IndexedFileStorage для view-based API.
function createViewStorageMock(
  rows: Array<{ path: string; content_hash: string }>,
): IndexedFileStorage {
  return {
    getByView: vi.fn().mockResolvedValue(
      rows.map((r) => ({
        id: `id-${r.path}`,
        source_view_id: 'view-1',
        path: r.path,
        content_hash: r.content_hash,
        indexed_at: new Date(),
      })),
    ),
    getBySource: vi.fn().mockResolvedValue([]),
    upsertMany: vi.fn(),
    deleteByIds: vi.fn(),
    deleteByPaths: vi.fn(),
  } as unknown as IndexedFileStorage;
}

function makeView(overrides: Partial<SourceViewRow> = {}): SourceViewRow {
  return {
    id: 'view-1',
    source_id: 'source-1',
    view_kind: 'branch',
    ref_name: 'main',
    head_commit_oid: 'commit-1',
    head_tree_oid: 'tree-1',
    subtree_oid: null,
    dirty: false,
    snapshot_fingerprint: 'tree:tree-1',
    file_count: 0,
    chunk_count: 0,
    last_seen_at: new Date(),
    last_indexed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('detectViewChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('новый view (нет previousViewState) → full-scan', async () => {
    const storage = createViewStorageMock([]);
    const files = [makeFile('a.ts', 'const a = 1;')];

    const result = await detectViewChanges({
      sourceView: makeView(),
      previousViewState: undefined,
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]!.path).toBe('a.ts');
    expect(result.deletedPaths).toHaveLength(0);
  });

  it('clean git, headTreeOid совпадает → skip', async () => {
    const storage = createViewStorageMock([]);
    const files = [makeFile('a.ts', 'code')];

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-1',
        subtreeOid: null,
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-1', // Совпадает с previous.
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('skip');
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedPaths).toHaveLength(0);
  });

  it('clean git, subtreeOid совпадает → skip', async () => {
    const storage = createViewStorageMock([]);

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-1',
        subtreeOid: 'sub-1',
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: 'packages/core',
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-2',
        subtreeOid: 'sub-1', // Совпадает.
        dirty: false,
      },
      scannedFiles: [],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('skip');
  });

  it('ancestor relationship → diff-scan', async () => {
    const storage = createViewStorageMock([
      { path: 'a.ts', content_hash: sha256('old code') },
    ]);
    const files = [
      makeFile('a.ts', 'new code'),
      makeFile('b.ts', 'brand new'),
    ];

    vi.mocked(isAncestor).mockResolvedValue(true);
    vi.mocked(getCommittedDiffPaths).mockResolvedValue(['a.ts', 'b.ts']);
    vi.mocked(getTrackedWorktreeChanges).mockResolvedValue([]);
    vi.mocked(getUntrackedFiles).mockResolvedValue([]);

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-1',
        subtreeOid: null,
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-2',
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('diff-scan');
    expect(result.changedFiles).toHaveLength(2);
    expect(getCommittedDiffPaths).toHaveBeenCalledWith('/repo', 'commit-1', 'commit-2', undefined);
  });

  it('non-ancestor → full-scan', async () => {
    const storage = createViewStorageMock([]);
    const files = [makeFile('a.ts', 'code')];

    vi.mocked(isAncestor).mockResolvedValue(false);

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-old',
        subtreeOid: null,
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-new',
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
  });

  it('previous dirty → full-scan (нет diff)', async () => {
    const storage = createViewStorageMock([]);
    const files = [makeFile('a.ts', 'code')];

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-1',
        subtreeOid: null,
        dirty: true, // Previous was dirty.
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-2',
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
    // isAncestor не вызывается при dirty previous.
    expect(isAncestor).not.toHaveBeenCalled();
  });

  it('workspace (non-git) → full-scan с hash-сравнением', async () => {
    const contentA = 'same content';
    const storage = createViewStorageMock([
      { path: 'a.ts', content_hash: sha256(contentA) },
      { path: 'deleted.ts', content_hash: sha256('old') },
    ]);
    const files = [
      makeFile('a.ts', contentA),
      makeFile('new.ts', 'brand new'),
    ];

    const result = await detectViewChanges({
      sourceView: makeView({ view_kind: 'workspace', last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: null,
        headTreeOid: null,
        subtreeOid: null,
        dirty: false,
      },
      // Нет gitContext — workspace.
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
    // a.ts не изменился (hash совпадает), new.ts — новый, deleted.ts — удалён.
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]!.path).toBe('new.ts');
    expect(result.deletedPaths).toEqual(['deleted.ts']);
  });

  it('dirty git + ancestor → diff-scan включает tracked + untracked', async () => {
    const storage = createViewStorageMock([]);
    const files = [
      makeFile('committed.ts', 'code1'),
      makeFile('tracked.ts', 'code2'),
      makeFile('untracked.ts', 'code3'),
    ];

    vi.mocked(isAncestor).mockResolvedValue(true);
    vi.mocked(getCommittedDiffPaths).mockResolvedValue(['committed.ts']);
    vi.mocked(getTrackedWorktreeChanges).mockResolvedValue(['tracked.ts']);
    vi.mocked(getUntrackedFiles).mockResolvedValue(['untracked.ts']);

    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-1',
        subtreeOid: null,
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-2',
        subtreeOid: null,
        dirty: true,
      },
      scannedFiles: files,
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('diff-scan');
    expect(result.changedFiles).toHaveLength(3);
    const paths = result.changedFiles.map((f) => f.path);
    expect(paths).toContain('committed.ts');
    expect(paths).toContain('tracked.ts');
    expect(paths).toContain('untracked.ts');
  });
});
