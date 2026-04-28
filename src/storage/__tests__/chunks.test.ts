import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChunkStorage } from '../chunks.js';

function createMockSql(captured: { params: unknown[] }) {
  const fn = Object.assign(vi.fn().mockResolvedValue([]), {
    unsafe: vi.fn().mockResolvedValue([]),
    begin: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        unsafe: vi.fn().mockImplementation((_sqlText: string, params: unknown[]) => {
          captured.params = params;
          return Promise.resolve([]);
        }),
      };
      return cb(tx);
    }),
  });

  return fn as unknown as import('postgres').Sql;
}

describe('ChunkStorage', () => {
  let captured: { params: unknown[] };
  let sql: ReturnType<typeof createMockSql>;
  let storage: ChunkStorage;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    captured = { params: [] };
    sql = createMockSql(captured);
    storage = new ChunkStorage(sql);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('insertBatch передаёт произвольные metadata-ключи в jsonb-параметр', async () => {
    await storage.insertBatch([
      {
        sourceViewId: '00000000-0000-0000-0000-000000000001',
        indexedFileId: '00000000-0000-0000-0000-000000000002',
        chunkContentHash: 'hash-1',
        path: 'src/Foo.kt',
        sourceType: 'code',
        startLine: 10,
        endLine: 30,
        headerPath: 'Foo.bar',
        language: 'kotlin',
        ordinal: 0,
        metadata: {
          fqn: 'com.example.Foo.bar',
          fragmentType: 'method',
          fragmentSubtype: 'DATA_CLASS',
          receiverType: 'String',
          headerLevel: 2,
          startOffset: 100,
          endOffset: 240,
          pageStart: 3,
          pageEnd: 4,
        },
      },
    ]);

    expect(captured.params).toHaveLength(11);
    const metadataParam = captured.params[10];
    expect(metadataParam).toEqual({
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
      fragmentSubtype: 'DATA_CLASS',
      receiverType: 'String',
      headerLevel: 2,
      startOffset: 100,
      endOffset: 240,
      pageStart: 3,
      pageEnd: 4,
    });
  });
});
