import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceViewStorage } from '../source-views.js';
import type { SourceViewRow } from '../schema.js';

// Фабрика мок-view.
function makeView(overrides: Partial<SourceViewRow> = {}): SourceViewRow {
  return {
    id: 'view-1',
    source_id: 'src-1',
    view_kind: 'branch',
    ref_name: 'main',
    head_commit_oid: 'abc123',
    head_tree_oid: 'def456',
    subtree_oid: null,
    dirty: false,
    snapshot_fingerprint: 'tree:def456',
    file_count: 10,
    chunk_count: 50,
    last_seen_at: new Date(),
    last_indexed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Мок SQL-клиент.
function createMockSql() {
  const fn = Object.assign(vi.fn().mockResolvedValue([]), {
    unsafe: vi.fn().mockResolvedValue([]),
  });

  return fn as unknown as import('postgres').Sql;
}

describe('SourceViewStorage', () => {
  let sql: ReturnType<typeof createMockSql>;
  let storage: SourceViewStorage;

  beforeEach(() => {
    sql = createMockSql();
    storage = new SourceViewStorage(sql as unknown as import('postgres').Sql);
  });

  it('создаёт экземпляр', () => {
    expect(storage).toBeInstanceOf(SourceViewStorage);
  });

  it('getWorkspaceView возвращает null при отсутствии', async () => {
    const result = await storage.getWorkspaceView('src-1');

    expect(result).toBeNull();
  });

  it('getWorkspaceView возвращает view', async () => {
    const view = makeView({ view_kind: 'workspace', ref_name: null });
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([view]);

    const result = await storage.getWorkspaceView('src-1');

    expect(result).toEqual(view);
  });

  it('getRefView возвращает null при отсутствии', async () => {
    const result = await storage.getRefView('src-1', 'branch', 'main');

    expect(result).toBeNull();
  });

  it('listBySource возвращает пустой массив', async () => {
    const result = await storage.listBySource('src-1');

    expect(result).toEqual([]);
  });

  it('deleteMissingBranchViews с пустым списком веток удаляет все branch views', async () => {
    const deleted = [{ id: 'view-1' }, { id: 'view-2' }];
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(deleted);

    const result = await storage.deleteMissingBranchViews('src-1', []);

    expect(result).toEqual(['view-1', 'view-2']);
  });

  it('upsertView вызывает SQL', async () => {
    const view = makeView();
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([view]);

    const result = await storage.upsertView({
      sourceId: 'src-1',
      viewKind: 'branch',
      refName: 'main',
      snapshotFingerprint: 'tree:def456',
    });

    expect(result).toEqual(view);
  });

  it('resolveDefaultViews возвращает пустой массив', async () => {
    const result = await storage.resolveDefaultViews();

    expect(result).toEqual([]);
  });
});
