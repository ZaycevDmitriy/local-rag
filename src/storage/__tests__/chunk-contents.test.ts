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

  it('searchBm25 возвращает результаты по GIN-индексу', async () => {
    const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
    mockFn.mockResolvedValueOnce([
      { content_hash: 'hash1', score: 0.8 },
      { content_hash: 'hash2', score: 0.6 },
    ]);

    const result = await storage.searchBm25('function test', 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ contentHash: 'hash1', score: 0.8 });
    expect(result[1]).toEqual({ contentHash: 'hash2', score: 0.6 });
  });

  it('searchBm25 с prefilter contentHashes (narrow mode)', async () => {
    const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
    mockFn.mockResolvedValueOnce([{ content_hash: 'hash1', score: 0.9 }]);

    const result = await storage.searchBm25('test', 10, ['hash1', 'hash2']);

    expect(result).toHaveLength(1);
    expect(result[0]!.contentHash).toBe('hash1');
  });

  it('searchBm25 возвращает пустой массив для пустого запроса', async () => {
    const result = await storage.searchBm25('', 10);

    expect(result).toEqual([]);
  });

  it('searchVector вызывает sql.unsafe с vector параметром', async () => {
    const unsafeFn = (sql as unknown as { unsafe: ReturnType<typeof vi.fn> }).unsafe;
    unsafeFn.mockResolvedValueOnce([
      { content_hash: 'hash1', distance: 0.2 },
    ]);

    const result = await storage.searchVector([0.1, 0.2], 10);

    expect(result).toHaveLength(1);
    // distance 0.2 → score = 1 - 0.2 = 0.8.
    expect(result[0]!.score).toBe(0.8);
    expect(unsafeFn).toHaveBeenCalled();
  });

  it('searchVector с prefilter (narrow mode)', async () => {
    const unsafeFn = (sql as unknown as { unsafe: ReturnType<typeof vi.fn> }).unsafe;
    unsafeFn.mockResolvedValueOnce([
      { content_hash: 'hash1', distance: 0.1 },
    ]);

    const result = await storage.searchVector([0.1], 10, ['hash1']);

    expect(result).toHaveLength(1);
    expect(result[0]!.contentHash).toBe('hash1');
  });
});
