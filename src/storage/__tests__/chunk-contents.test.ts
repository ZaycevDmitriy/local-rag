import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkContentStorage } from '../chunk-contents.js';

// Мок SQL-клиент.
function createMockSql() {
  const fn = Object.assign(vi.fn().mockResolvedValue([]), {
    unsafe: vi.fn().mockResolvedValue([]),
    begin: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = { unsafe: vi.fn().mockResolvedValue([]) };
      return cb(tx);
    }),
  });

  return fn as unknown as import('postgres').Sql;
}

describe('ChunkContentStorage', () => {
  let sql: ReturnType<typeof createMockSql>;
  let storage: ChunkContentStorage;

  beforeEach(() => {
    sql = createMockSql();
    storage = new ChunkContentStorage(sql as unknown as import('postgres').Sql);
  });

  it('создаёт экземпляр', () => {
    expect(storage).toBeInstanceOf(ChunkContentStorage);
  });

  it('insertBatch не выполняет SQL для пустого массива', async () => {
    await storage.insertBatch([]);

    expect(sql).not.toHaveBeenCalled();
    expect(sql.unsafe).not.toHaveBeenCalled();
  });

  it('insertBatch вызывает sql.unsafe для непустого массива', async () => {
    await storage.insertBatch([
      { contentHash: 'hash1', content: 'chunk body' },
    ]);

    expect(sql.unsafe).toHaveBeenCalledTimes(1);
    expect(sql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chunk_contents'),
      expect.arrayContaining(['hash1', 'chunk body']),
    );
  });

  it('getByHashes возвращает пустой массив для пустого входа', async () => {
    const result = await storage.getByHashes([]);

    expect(result).toEqual([]);
  });

  it('getWithNullEmbedding возвращает пустой массив', async () => {
    const result = await storage.getWithNullEmbedding(10);

    expect(result).toEqual([]);
  });

  it('updateEmbeddings не выполняет SQL для пустого массива', async () => {
    await storage.updateEmbeddings([]);

    expect(sql.begin).not.toHaveBeenCalled();
  });

  it('updateEmbeddings вызывает begin для непустого массива', async () => {
    await storage.updateEmbeddings([
      { contentHash: 'hash1', embedding: [0.1, 0.2, 0.3] },
    ]);

    expect(sql.begin).toHaveBeenCalledTimes(1);
  });

  it('deleteOrphans возвращает количество удалённых', async () => {
    (sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 3 });

    const result = await storage.deleteOrphans(60);

    expect(result).toBe(3);
  });

  it('searchBm25 бросает ошибку (stub)', async () => {
    await expect(storage.searchBm25('test', 10)).rejects.toThrow('Task 7');
  });

  it('searchVector бросает ошибку (stub)', async () => {
    await expect(storage.searchVector([0.1], 10)).rejects.toThrow('Task 7');
  });
});
