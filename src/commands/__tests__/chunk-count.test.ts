import { describe, it, expect, vi } from 'vitest';
import type { SourceViewRow, SourceViewStorage } from '../../storage/index.js';
import { sumChunksForSource } from '../_helpers/chunk-count.js';

// Фабрика мок-view.
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

describe('sumChunksForSource', () => {
  it('возвращает 0 при отсутствии views', async () => {
    const storage = {
      listBySource: vi.fn().mockResolvedValue([]),
    } as unknown as SourceViewStorage;

    const result = await sumChunksForSource(storage, 'src-1');

    expect(result).toBe(0);
    expect(storage.listBySource).toHaveBeenCalledWith('src-1');
  });

  it('суммирует chunk_count по всем views источника', async () => {
    const storage = {
      listBySource: vi.fn().mockResolvedValue([
        makeView({ id: 'v1', chunk_count: 100 }),
        makeView({ id: 'v2', chunk_count: 50, view_kind: 'branch', ref_name: 'main' }),
      ]),
    } as unknown as SourceViewStorage;

    const result = await sumChunksForSource(storage, 'src-1');

    expect(result).toBe(150);
  });

  it('возвращает 0 для views с нулевыми счётчиками', async () => {
    const storage = {
      listBySource: vi.fn().mockResolvedValue([
        makeView({ chunk_count: 0 }),
        makeView({ chunk_count: 0 }),
      ]),
    } as unknown as SourceViewStorage;

    const result = await sumChunksForSource(storage, 'src-1');

    expect(result).toBe(0);
  });

  it('учитывает только views, возвращённые listBySource (изоляция по sourceId)', async () => {
    const listBySource = vi.fn().mockImplementation(async (sourceId: string) => {
      if (sourceId === 'src-1') {
        return [makeView({ source_id: 'src-1', chunk_count: 10 })];
      }
      return [makeView({ source_id: 'src-2', chunk_count: 999 })];
    });

    const storage = { listBySource } as unknown as SourceViewStorage;

    expect(await sumChunksForSource(storage, 'src-1')).toBe(10);
    expect(await sumChunksForSource(storage, 'src-2')).toBe(999);
  });
});
