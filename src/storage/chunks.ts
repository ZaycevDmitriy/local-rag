// CRUD-операции для таблицы chunks.
import pgvector from 'pgvector';
import type postgres from 'postgres';
import type { ChunkRow } from './schema.js';
import type { ChunkMetadata } from '../chunks/types.js';

// Приводим ChunkMetadata к типу, совместимому с postgres.JSONValue.
type JsonSafe = postgres.JSONValue;

// Размер пачки для batch-вставки.
const BATCH_SIZE = 100;

// Хранилище фрагментов с эмбеддингами.
export class ChunkStorage {
  constructor(private sql: postgres.Sql) {}

  // Вставляет чанки пачками по BATCH_SIZE в транзакции.
  async insertBatch(chunks: Array<{
    sourceId: string;
    content: string;
    contentHash: string;
    metadata: ChunkMetadata;
    embedding: number[];
  }>): Promise<void> {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      // Вставляем пачку в одной транзакции для снижения round-trip overhead.
      // Type assertion нужен: TransactionSql работает как tagged template в runtime,
      // но TypeScript-типы пакета postgres не отражают это корректно.
      await this.sql.begin(async (tx: unknown) => {
        const query = tx as postgres.Sql;
        for (const chunk of batch) {
          const vectorStr = pgvector.toSql(chunk.embedding) as string;

          await query`
            INSERT INTO chunks (source_id, content, content_hash, metadata, embedding)
            VALUES (
              ${chunk.sourceId},
              ${chunk.content},
              ${chunk.contentHash},
              ${this.sql.json(chunk.metadata as unknown as JsonSafe)},
              ${vectorStr}::vector
            )
          `;
        }
      });
    }
  }

  // Удаляет все чанки источника. Возвращает количество удаленных.
  async deleteBySource(sourceId: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM chunks WHERE source_id = ${sourceId}
    `;

    return result.count;
  }

  // Удаляет чанки по пути файла внутри источника. Возвращает количество удаленных.
  async deleteByPath(sourceId: string, path: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM chunks
      WHERE source_id = ${sourceId}
        AND metadata->>'path' = ${path}
    `;

    return result.count;
  }

  // Полнотекстовый поиск BM25 по tsvector.
  async searchBm25(
    query: string,
    limit: number,
    sourceId?: string,
    sourceType?: string,
    pathPrefix?: string,
  ): Promise<Array<{ id: string; score: number }>> {
    return await this.sql<Array<{ id: string; score: number }>>`
      SELECT id, ts_rank_cd(search_vector, q) AS score
      FROM chunks, plainto_tsquery('simple', ${query}) q
      WHERE search_vector @@ q
        ${sourceId ? this.sql`AND source_id = ${sourceId}` : this.sql``}
        ${sourceType ? this.sql`AND metadata->>'sourceType' = ${sourceType}` : this.sql``}
        ${pathPrefix ? this.sql`AND metadata->>'path' LIKE ${pathPrefix + '%'}` : this.sql``}
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  // Векторный поиск по cosine distance.
  async searchVector(
    embedding: number[],
    limit: number,
    sourceId?: string,
    sourceType?: string,
    pathPrefix?: string,
  ): Promise<Array<{ id: string; score: number }>> {
    const vectorStr = pgvector.toSql(embedding) as string;

    return await this.sql<Array<{ id: string; score: number }>>`
      SELECT id, 1 - (embedding <=> ${vectorStr}::vector) AS score
      FROM chunks
      WHERE embedding IS NOT NULL
        ${sourceId ? this.sql`AND source_id = ${sourceId}` : this.sql``}
        ${sourceType ? this.sql`AND metadata->>'sourceType' = ${sourceType}` : this.sql``}
        ${pathPrefix ? this.sql`AND metadata->>'path' LIKE ${pathPrefix + '%'}` : this.sql``}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }

  // Возвращает количество чанков для источника.
  async countBySource(sourceId: string): Promise<number> {
    const result = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM chunks WHERE source_id = ${sourceId}
    `;

    return parseInt(result[0]!.count, 10);
  }

  // Находит чанк по пути файла и headerPath внутри источника.
  async findByHeaderPath(
    sourceId: string,
    path: string,
    headerPath: string,
  ): Promise<ChunkRow | null> {
    const rows = await this.sql<ChunkRow[]>`
      SELECT * FROM chunks
      WHERE source_id = ${sourceId}
        AND metadata->>'path' = ${path}
        AND metadata->>'headerPath' = ${headerPath}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  // Возвращает чанки по массиву ID в порядке переданных ID.
  async getByIds(ids: string[]): Promise<ChunkRow[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.sql<ChunkRow[]>`
      SELECT * FROM chunks WHERE id = ANY(${ids})
    `;

    // Сортируем в порядке переданных ID.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const result: ChunkRow[] = [];

    for (const id of ids) {
      const row = byId.get(id);

      if (row) {
        result.push(row);
      }
    }

    return result;
  }

  // Возвращает чанки для перегенерации эмбеддингов.
  // force=false → только с NULL embedding, force=true → все.
  async getChunksForReEmbed(options: {
    sourceId?: string;
    force: boolean;
    limit: number;
    offset: number;
  }): Promise<ChunkRow[]> {
    const { sourceId, force, limit, offset } = options;

    return await this.sql<ChunkRow[]>`
      SELECT * FROM chunks
      WHERE TRUE
        ${!force ? this.sql`AND embedding IS NULL` : this.sql``}
        ${sourceId ? this.sql`AND source_id = ${sourceId}` : this.sql``}
      ORDER BY created_at
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }

  // Обновляет эмбеддинг одного чанка.
  async updateEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const vectorStr = pgvector.toSql(embedding) as string;

    await this.sql`
      UPDATE chunks SET embedding = ${vectorStr}::vector WHERE id = ${chunkId}
    `;
  }

  // Подсчёт чанков для re-embed.
  async countForReEmbed(sourceId?: string, force?: boolean): Promise<number> {
    const result = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM chunks
      WHERE TRUE
        ${!force ? this.sql`AND embedding IS NULL` : this.sql``}
        ${sourceId ? this.sql`AND source_id = ${sourceId}` : this.sql``}
    `;

    return parseInt(result[0]!.count, 10);
  }
}
