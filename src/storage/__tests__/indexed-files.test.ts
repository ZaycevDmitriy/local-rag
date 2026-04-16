import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexedFileStorage } from '../indexed-files.js';
import type { IndexedFileRow } from '../schema.js';

// Мок SQL-клиент, совместимый с тэг-функцией postgres.
function createMockSql() {
  const fn = Object.assign(vi.fn().mockResolvedValue([]), {
    unsafe: vi.fn().mockResolvedValue([]),
  });

  return fn as unknown as import('postgres').Sql;
}

// Фабрика IndexedFileRow для тестов.
function makeRow(overrides: Partial<IndexedFileRow> = {}): IndexedFileRow {
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

describe('IndexedFileStorage', () => {
  let sql: ReturnType<typeof createMockSql>;
  let storage: IndexedFileStorage;

  beforeEach(() => {
    sql = createMockSql();
    storage = new IndexedFileStorage(sql as unknown as import('postgres').Sql);
  });

  describe('getChunklessFiles', () => {
    it('возвращает файлы без chunks для данного view', async () => {
      const rows = [
        makeRow({ id: 'f1', path: 'src/a.ts' }),
        makeRow({ id: 'f2', path: 'src/b.ts' }),
      ];
      (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rows);

      const result = await storage.getChunklessFiles('view-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.path).toBe('src/a.ts');
      expect(sql).toHaveBeenCalledTimes(1);
    });

    it('возвращает пустой массив, если все файлы имеют chunks', async () => {
      (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await storage.getChunklessFiles('view-1');

      expect(result).toEqual([]);
    });

    it('передаёт viewId в SQL-запрос', async () => {
      (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await storage.getChunklessFiles('view-xyz');

      // Первый аргумент тэг-функции — массив SQL-фрагментов.
      const call = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const params = call.slice(1);
      expect(params).toContain('view-xyz');
    });
  });
});
