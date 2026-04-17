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

  // --- summary methods (миграция 006). ---

  describe('summary methods', () => {
    it('getWithNullSummary без afterHash делает SELECT без cursor', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([]);

      await storage.getWithNullSummary(10);

      expect(mockFn).toHaveBeenCalled();
    });

    it('getWithNullSummary с afterHash формирует keyset cursor', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([{
        content_hash: 'hash2',
        content: 'body',
        embedding: null,
        summary: null,
        summary_embedding: null,
        created_at: new Date(),
      }]);

      const rows = await storage.getWithNullSummary(5, 'hash1');

      expect(rows).toHaveLength(1);
      expect(rows[0]!.content_hash).toBe('hash2');
    });

    it('countWithNullSummary возвращает число', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([{ count: '42' }]);

      const n = await storage.countWithNullSummary();
      expect(n).toBe(42);
    });

    it('updateSummaries не вызывает begin на пустом массиве', async () => {
      await storage.updateSummaries([]);
      expect(sql.begin).not.toHaveBeenCalled();
    });

    it('updateSummaries открывает транзакцию и UPDATE через tx.unsafe', async () => {
      await storage.updateSummaries([
        { contentHash: 'h1', summary: 'sum 1' },
        { contentHash: 'h2', summary: 'sum 2' },
      ]);

      expect(sql.begin).toHaveBeenCalledTimes(1);
    });

    it('updateSummaryEmbeddings не вызывает begin на пустом массиве', async () => {
      await storage.updateSummaryEmbeddings([]);
      expect(sql.begin).not.toHaveBeenCalled();
    });

    it('updateSummaryEmbeddings вызывает begin для батча', async () => {
      await storage.updateSummaryEmbeddings([
        { contentHash: 'h1', embedding: [0.1, 0.2] },
      ]);

      expect(sql.begin).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchSummaryVector', () => {
    it('broad mode: использует partial HNSW (WHERE summary_embedding IS NOT NULL)', async () => {
      const unsafeFn = (sql as unknown as { unsafe: ReturnType<typeof vi.fn> }).unsafe;
      unsafeFn.mockResolvedValueOnce([
        { content_hash: 'h1', distance: 0.3 },
      ]);

      const result = await storage.searchSummaryVector([0.1, 0.2], 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ contentHash: 'h1', score: 1 - 0.3 });
      expect(unsafeFn).toHaveBeenCalled();
      const [sqlText] = unsafeFn.mock.calls[0]!;
      expect(sqlText).toMatch(/summary_embedding IS NOT NULL/);
    });

    it('narrow mode: exact search по prefiltered content_hash set', async () => {
      const unsafeFn = (sql as unknown as { unsafe: ReturnType<typeof vi.fn> }).unsafe;
      unsafeFn.mockResolvedValueOnce([
        { content_hash: 'h1', distance: 0.1 },
      ]);

      const result = await storage.searchSummaryVector([0.1], 10, ['h1', 'h2']);

      expect(result).toHaveLength(1);
      expect(result[0]!.contentHash).toBe('h1');
      const [sqlText, params] = unsafeFn.mock.calls[0]!;
      expect(sqlText).toMatch(/content_hash = ANY/);
      expect(params[1]).toEqual(['h1', 'h2']);
    });

    it('пустой prefilter эквивалентен broad mode', async () => {
      const unsafeFn = (sql as unknown as { unsafe: ReturnType<typeof vi.fn> }).unsafe;
      unsafeFn.mockResolvedValueOnce([]);

      await storage.searchSummaryVector([0.1], 5, []);

      const [sqlText] = unsafeFn.mock.calls[0]!;
      expect(sqlText).not.toMatch(/content_hash = ANY/);
    });
  });

  describe('hasSummaryForViews', () => {
    it('возвращает false для пустого списка views без SQL', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      const result = await storage.hasSummaryForViews([]);
      expect(result).toBe(false);
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('возвращает true когда SQL EXISTS вернул true', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([{ exists: true }]);

      const result = await storage.hasSummaryForViews(['v1']);
      expect(result).toBe(true);
    });

    it('возвращает false когда SQL EXISTS вернул false', async () => {
      const mockFn = sql as unknown as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([{ exists: false }]);

      const result = await storage.hasSummaryForViews(['v1']);
      expect(result).toBe(false);
    });
  });
});
