import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileBlobStorage } from '../file-blobs.js';
import type { FileBlobRow } from '../schema.js';

// Мок SQL-клиент.
function createMockSql() {
  const fn = Object.assign(vi.fn().mockResolvedValue([]), {
    unsafe: vi.fn().mockResolvedValue([]),
  });

  return fn as unknown as import('postgres').Sql;
}

describe('FileBlobStorage', () => {
  let sql: ReturnType<typeof createMockSql>;
  let storage: FileBlobStorage;

  beforeEach(() => {
    sql = createMockSql();
    storage = new FileBlobStorage(sql as unknown as import('postgres').Sql);
  });

  it('создаёт экземпляр', () => {
    expect(storage).toBeInstanceOf(FileBlobStorage);
  });

  it('upsertMany не выполняет SQL для пустого массива', async () => {
    await storage.upsertMany([]);

    expect(sql).not.toHaveBeenCalled();
    expect(sql.unsafe).not.toHaveBeenCalled();
  });

  it('upsertMany вызывает sql.unsafe для непустого массива', async () => {
    await storage.upsertMany([
      { contentHash: 'hash1', content: 'file content', byteSize: 12 },
    ]);

    expect(sql.unsafe).toHaveBeenCalledTimes(1);
    expect(sql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO file_blobs'),
      expect.arrayContaining(['hash1', 'file content', 12]),
    );
  });

  it('getByHash возвращает null при отсутствии', async () => {
    const result = await storage.getByHash('nonexistent');

    expect(result).toBeNull();
  });

  it('getByHash возвращает blob', async () => {
    const blob: FileBlobRow = {
      content_hash: 'hash1',
      content: 'file content',
      byte_size: 12,
      created_at: new Date(),
    };
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([blob]);

    const result = await storage.getByHash('hash1');

    expect(result).toEqual(blob);
  });

  it('deleteOrphans вызывает SQL и возвращает количество', async () => {
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 5 });

    const result = await storage.deleteOrphans(30);

    expect(result).toBe(5);
  });
});
