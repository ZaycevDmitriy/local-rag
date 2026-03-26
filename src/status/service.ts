import type postgres from 'postgres';
import type { AppConfig } from '../config/index.js';
import { isTreeSitterSupported } from '../chunks/index.js';
import { getAppliedMigrations } from '../storage/index.js';
import type { SystemStatusSnapshot } from './types.js';

export async function getSystemStatusSnapshot(
  sql: postgres.Sql,
  config: AppConfig,
): Promise<SystemStatusSnapshot> {
  const [sourcesResult, chunksResult, lastIndexedResult, appliedMigrations] = await Promise.all([
    sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM sources`,
    sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM chunks`,
    sql<Array<{ last_indexed_at: Date | null }>>`
      SELECT MAX(last_indexed_at) AS last_indexed_at FROM sources
    `,
    getAppliedMigrations(sql),
  ]);

  return {
    sourceCount: parseInt(sourcesResult[0]!.count, 10),
    chunkCount: parseInt(chunksResult[0]!.count, 10),
    lastIndexedAt: lastIndexedResult[0]?.last_indexed_at?.toISOString() ?? null,
    appliedMigrations,
    embeddingsProvider: config.embeddings.provider,
    rerankerProvider: config.reranker.provider,
    search: {
      bm25Weight: config.search.bm25Weight,
      vectorWeight: config.search.vectorWeight,
      finalTopK: config.search.finalTopK,
      retrieveTopK: config.search.retrieveTopK,
    },
    treeSitterLanguages: {
      typescript: 'active',
      javascript: 'active',
      java: isTreeSitterSupported('Test.java') ? 'active' : 'fallback',
      kotlin: isTreeSitterSupported('Test.kt') ? 'active' : 'fallback',
    },
  };
}
