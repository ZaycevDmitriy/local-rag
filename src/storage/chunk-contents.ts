// CRUD-операции для таблицы chunk_contents (дедуплицированное содержимое чанков).
import pgvector from 'pgvector';
import type postgres from 'postgres';
import type { ChunkContentRow } from './schema.js';

// Вход для batch-вставки содержимого.
export interface ChunkContentInsert {
  contentHash: string;
  content: string;
}

// Размер пачки для batch-операций.
const BATCH_SIZE = 100;

// Хранилище дедуплицированного содержимого чанков.
export class ChunkContentStorage {
  constructor(private sql: postgres.Sql) {}

  // Вставляет content rows пачками. ON CONFLICT DO NOTHING для дедупликации.
  // Возвращает void — caller использует content_hash как FK напрямую.
  async insertBatch(contents: ChunkContentInsert[]): Promise<void> {
    if (contents.length === 0) return;

    console.log(`[ChunkContentStorage] insertBatch: count=${contents.length}`);

    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const batch = contents.slice(i, i + BATCH_SIZE);

      const valueClauses = batch.map((_, idx) => {
        const base = idx * 2;
        return `($${base + 1}, $${base + 2})`;
      }).join(', ');

      const params = batch.flatMap((c) => [c.contentHash, c.content]);

      await this.sql.unsafe(
        `INSERT INTO chunk_contents (content_hash, content) VALUES ${valueClauses} ON CONFLICT (content_hash) DO NOTHING`,
        params,
      );
    }
  }

  // Возвращает content rows по массиву content_hash.
  async getByHashes(hashes: string[]): Promise<ChunkContentRow[]> {
    if (hashes.length === 0) return [];

    return await this.sql<ChunkContentRow[]>`
      SELECT * FROM chunk_contents WHERE content_hash = ANY(${hashes})
    `;
  }

  // Возвращает content rows с NULL embedding для re-embed.
  async getWithNullEmbedding(limit: number): Promise<ChunkContentRow[]> {
    return await this.sql<ChunkContentRow[]>`
      SELECT * FROM chunk_contents
      WHERE embedding IS NULL
      ORDER BY created_at
      LIMIT ${limit}
    `;
  }

  // Обновляет embeddings пачками.
  async updateEmbeddings(
    updates: Array<{ contentHash: string; embedding: number[] }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    console.log(`[ChunkContentStorage] updateEmbeddings: count=${updates.length}`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      // Транзакция для batch-обновления.
      await this.sql.begin(async (tx) => {
        for (const update of batch) {
          const vectorStr = pgvector.toSql(update.embedding) as string;

          await tx.unsafe(
            'UPDATE chunk_contents SET embedding = $1::vector WHERE content_hash = $2',
            [vectorStr, update.contentHash],
          );
        }
      });
    }
  }

  // Удаляет orphan chunk_contents, на которые не ссылается ни один chunk.
  // Grace period — минуты с момента создания.
  async deleteOrphans(gracePeriodMinutes = 60): Promise<number> {
    console.log(`[ChunkContentStorage] deleteOrphans: gracePeriod=${gracePeriodMinutes}min`);

    const result = await this.sql`
      DELETE FROM chunk_contents cc
      WHERE NOT EXISTS (
        SELECT 1 FROM chunks c
        WHERE c.chunk_content_hash = cc.content_hash
      )
      AND cc.created_at < now() - ${gracePeriodMinutes + ' minutes'}::interval
    `;

    console.log(`[ChunkContentStorage] deleteOrphans: deleted=${result.count}`);

    return result.count;
  }

  /**
   * BM25 search по chunk_contents через GIN-индекс на search_vector.
   * contentHashes — optional prefilter (narrow mode).
   */
  async searchBm25(
    query: string,
    limit: number,
    contentHashes?: string[],
  ): Promise<Array<{ contentHash: string; score: number }>> {
    // Формируем tsquery из простых термов.
    const tsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_]/g, ''))
      .filter(Boolean)
      .join(' & ');

    if (!tsQuery) return [];

    console.log(`[ChunkContentStorage] searchBm25: query="${tsQuery}", limit=${limit}, prefilter=${contentHashes?.length ?? 'none'}`);

    if (contentHashes && contentHashes.length > 0) {
      // Narrow mode: prefilter по content hashes.
      const rows = await this.sql<Array<{ content_hash: string; score: number }>>`
        SELECT content_hash, ts_rank(search_vector, to_tsquery('simple', ${tsQuery})) AS score
        FROM chunk_contents
        WHERE search_vector @@ to_tsquery('simple', ${tsQuery})
          AND content_hash = ANY(${contentHashes})
        ORDER BY score DESC
        LIMIT ${limit}
      `;
      return rows.map((r) => ({ contentHash: r.content_hash, score: Number(r.score) }));
    }

    // Broad mode: search по всем chunk_contents.
    const rows = await this.sql<Array<{ content_hash: string; score: number }>>`
      SELECT content_hash, ts_rank(search_vector, to_tsquery('simple', ${tsQuery})) AS score
      FROM chunk_contents
      WHERE search_vector @@ to_tsquery('simple', ${tsQuery})
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ contentHash: r.content_hash, score: Number(r.score) }));
  }

  /**
   * Vector search по chunk_contents через HNSW-индекс.
   * contentHashes — optional prefilter (narrow mode).
   */
  async searchVector(
    queryEmbedding: number[],
    limit: number,
    contentHashes?: string[],
  ): Promise<Array<{ contentHash: string; score: number }>> {
    const vectorStr = pgvector.toSql(queryEmbedding) as string;

    console.log(`[ChunkContentStorage] searchVector: limit=${limit}, prefilter=${contentHashes?.length ?? 'none'}`);

    if (contentHashes && contentHashes.length > 0) {
      // Narrow: exact search по prefiltered set.
      const rows = await this.sql.unsafe<Array<{ content_hash: string; distance: number }>>(
        `SELECT content_hash, embedding <=> $1::vector AS distance
         FROM chunk_contents
         WHERE embedding IS NOT NULL
           AND content_hash = ANY($2)
         ORDER BY distance
         LIMIT $3`,
        [vectorStr, contentHashes, limit],
      );
      // Конвертируем distance в score (1 - distance для cosine).
      return rows.map((r) => ({ contentHash: r.content_hash, score: 1 - Number(r.distance) }));
    }

    // Broad: ANN overfetch.
    const rows = await this.sql.unsafe<Array<{ content_hash: string; distance: number }>>(
      `SELECT content_hash, embedding <=> $1::vector AS distance
       FROM chunk_contents
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit],
    );
    return rows.map((r) => ({ contentHash: r.content_hash, score: 1 - Number(r.distance) }));
  }
}
