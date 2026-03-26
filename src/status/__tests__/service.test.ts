import { describe, it, expect, vi, beforeEach } from 'vitest';
import type postgres from 'postgres';
import { AppConfigSchema } from '../../config/index.js';

vi.mock('../../chunks/index.js', () => ({
  isTreeSitterSupported: vi.fn(),
}));

vi.mock('../../storage/index.js', () => ({
  getAppliedMigrations: vi.fn(),
}));

import { isTreeSitterSupported } from '../../chunks/index.js';
import { getAppliedMigrations } from '../../storage/index.js';
import { getSystemStatusSnapshot } from '../service.js';

function createConfig() {
  return AppConfigSchema.parse({
    embeddings: {
      provider: 'siliconflow',
      siliconflow: {
        apiKey: 'sf-key',
      },
    },
    reranker: {
      provider: 'jina',
      jina: {
        apiKey: 'jina-key',
      },
    },
    search: {
      bm25Weight: 0.25,
      vectorWeight: 0.75,
      retrieveTopK: 30,
      finalTopK: 8,
    },
  });
}

function createSqlMock(lastIndexedAt: Date | null): postgres.Sql {
  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join(' ');

    if (query.includes('COUNT(*)::text AS count FROM sources')) {
      return [{ count: '2' }];
    }

    if (query.includes('COUNT(*)::text AS count FROM chunks')) {
      return [{ count: '15' }];
    }

    if (query.includes('MAX(last_indexed_at) AS last_indexed_at FROM sources')) {
      return [{ last_indexed_at: lastIndexedAt }];
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  return sql as unknown as postgres.Sql;
}

describe('getSystemStatusSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('собирает snapshot из БД, конфига и статуса tree-sitter', async () => {
    const indexedAt = new Date('2026-03-26T12:00:00.000Z');
    const sql = createSqlMock(indexedAt);

    vi.mocked(getAppliedMigrations).mockResolvedValue([
      '001_initial',
      '002_vector_dimensions',
    ]);
    vi.mocked(isTreeSitterSupported).mockImplementation((filePath: string) => (
      filePath.endsWith('.java')
    ));

    const snapshot = await getSystemStatusSnapshot(sql, createConfig());

    expect(snapshot).toEqual({
      sourceCount: 2,
      chunkCount: 15,
      lastIndexedAt: indexedAt.toISOString(),
      appliedMigrations: ['001_initial', '002_vector_dimensions'],
      embeddingsProvider: 'siliconflow',
      rerankerProvider: 'jina',
      search: {
        bm25Weight: 0.25,
        vectorWeight: 0.75,
        retrieveTopK: 30,
        finalTopK: 8,
      },
      treeSitterLanguages: {
        typescript: 'active',
        javascript: 'active',
        java: 'active',
        kotlin: 'fallback',
      },
    });

    expect(getAppliedMigrations).toHaveBeenCalledWith(sql);
    expect(isTreeSitterSupported).toHaveBeenNthCalledWith(1, 'Test.java');
    expect(isTreeSitterSupported).toHaveBeenNthCalledWith(2, 'Test.kt');
  });

  it('возвращает null для lastIndexedAt, если индексации ещё не было', async () => {
    const sql = createSqlMock(null);

    vi.mocked(getAppliedMigrations).mockResolvedValue(['001_initial']);
    vi.mocked(isTreeSitterSupported).mockReturnValue(true);

    const snapshot = await getSystemStatusSnapshot(sql, createConfig());

    expect(snapshot.lastIndexedAt).toBeNull();
  });
});
