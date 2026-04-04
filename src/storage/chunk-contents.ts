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

  // Stub — будет заменён в Task 7 (branch-aware search).
  async searchBm25(
    _query: string,
    _limit: number,
    _contentHashes?: string[],
  ): Promise<Array<{ contentHash: string; score: number }>> {
    throw new Error('Branch-aware search: будет реализовано в Task 7');
  }

  // Stub — будет заменён в Task 7 (branch-aware search).
  async searchVector(
    _queryEmbedding: number[],
    _limit: number,
    _contentHashes?: string[],
  ): Promise<Array<{ contentHash: string; score: number }>> {
    throw new Error('Branch-aware search: будет реализовано в Task 7');
  }
}
