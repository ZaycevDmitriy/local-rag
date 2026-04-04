// Regression тесты: branch lifecycle (branch1 → branch2 → modify → delete → gc).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceViewRow } from '../../storage/index.js';
import { detectViewChanges } from '../incremental.js';

// Мокируем git-функции.
vi.mock('../../sources/index.js', () => ({
  isAncestor: vi.fn(),
  getCommittedDiffPaths: vi.fn(),
  getTrackedWorktreeChanges: vi.fn(),
  getUntrackedFiles: vi.fn(),
}));

import { isAncestor, getCommittedDiffPaths, getTrackedWorktreeChanges, getUntrackedFiles } from '../../sources/index.js';

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

function createIndexedFileStorageMock(files: Array<{ path: string; content_hash: string }> = []) {
  return {
    getByView: vi.fn().mockResolvedValue(
      files.map((f) => ({
        id: `id-${f.path}`,
        source_view_id: 'view-1',
        path: f.path,
        content_hash: f.content_hash,
        indexed_at: new Date(),
      })),
    ),
  } as unknown as import('../../storage/index.js').IndexedFileStorage;
}

describe('Branch lifecycle regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTrackedWorktreeChanges).mockResolvedValue([]);
    vi.mocked(getUntrackedFiles).mockResolvedValue([]);
  });

  it('branch1 → branch2: новый view → full-scan (нет previousViewState)', async () => {
    const storage = createIndexedFileStorageMock([]);

    const result = await detectViewChanges({
      sourceView: makeView({ ref_name: 'feature/new-branch', last_indexed_at: null }),
      previousViewState: undefined,
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-new',
        headTreeOid: 'tree-new',
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: [
        { relativePath: 'a.ts', absolutePath: '/repo/a.ts', content: 'const a = 1;' },
      ],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
    expect(result.changedFiles).toHaveLength(1);
  });

  it('branch2 modify: ancestor → diff-scan для изменённых файлов', async () => {
    const storage = createIndexedFileStorageMock([
      { path: 'a.ts', content_hash: 'hash-old' },
    ]);

    vi.mocked(isAncestor).mockResolvedValue(true);
    vi.mocked(getCommittedDiffPaths).mockResolvedValue(['a.ts']);

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
      scannedFiles: [
        { relativePath: 'a.ts', absolutePath: '/repo/a.ts', content: 'const a = 2; // modified' },
      ],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('diff-scan');
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]!.path).toBe('a.ts');
  });

  it('rebase → full-scan (non-ancestor)', async () => {
    const storage = createIndexedFileStorageMock([
      { path: 'a.ts', content_hash: 'old-hash' },
    ]);

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
        headCommitOid: 'commit-rebased',
        headTreeOid: 'tree-rebased',
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: [
        { relativePath: 'a.ts', absolutePath: '/repo/a.ts', content: 'const a = 3;' },
      ],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('full-scan');
  });

  it('skip: unchanged tree OID → нет работы', async () => {
    const result = await detectViewChanges({
      sourceView: makeView({ last_indexed_at: new Date() }),
      previousViewState: {
        headCommitOid: 'commit-1',
        headTreeOid: 'tree-same',
        subtreeOid: null,
        dirty: false,
      },
      gitContext: {
        repoRoot: '/repo',
        repoSubpath: null,
        headCommitOid: 'commit-2',
        headTreeOid: 'tree-same', // Совпадает.
        subtreeOid: null,
        dirty: false,
      },
      scannedFiles: [],
      indexedFileStorage: createIndexedFileStorageMock(),
    });

    expect(result.strategy).toBe('skip');
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedPaths).toHaveLength(0);
  });

  it('dirty worktree + ancestor → diff-scan включает tracked changes', async () => {
    const storage = createIndexedFileStorageMock([]);

    vi.mocked(isAncestor).mockResolvedValue(true);
    vi.mocked(getCommittedDiffPaths).mockResolvedValue(['committed.ts']);
    vi.mocked(getTrackedWorktreeChanges).mockResolvedValue(['dirty.ts']);

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
      scannedFiles: [
        { relativePath: 'committed.ts', absolutePath: '/repo/committed.ts', content: 'new' },
        { relativePath: 'dirty.ts', absolutePath: '/repo/dirty.ts', content: 'dirty changes' },
        { relativePath: 'unchanged.ts', absolutePath: '/repo/unchanged.ts', content: 'same' },
      ],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('diff-scan');
    const paths = result.changedFiles.map((f) => f.path).sort();
    expect(paths).toEqual(['committed.ts', 'dirty.ts']);
    // unchanged.ts не в diff → не включён.
  });

  it('deleted file в committed diff → попадает в deletedPaths', async () => {
    const storage = createIndexedFileStorageMock([]);

    vi.mocked(isAncestor).mockResolvedValue(true);
    vi.mocked(getCommittedDiffPaths).mockResolvedValue(['existing.ts', 'deleted.ts']);

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
      scannedFiles: [
        // deleted.ts не в scannedFiles → удалён.
        { relativePath: 'existing.ts', absolutePath: '/repo/existing.ts', content: 'new' },
      ],
      indexedFileStorage: storage,
    });

    expect(result.strategy).toBe('diff-scan');
    expect(result.changedFiles).toHaveLength(1);
    expect(result.deletedPaths).toContain('deleted.ts');
  });
});
