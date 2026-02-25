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

  // Вставляет чанки пачками по BATCH_SIZE.
  async insertBatch(chunks: Array<{
    sourceId: string;
    content: string;
    contentHash: string;
    metadata: ChunkMetadata;
    embedding: number[];
  }>): Promise<void> {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      // Вставляем пачку через VALUES. Каждую строку вставляем отдельным запросом
      // внутри пачки, чтобы корректно использовать sql.json() для JSONB.
      for (const chunk of batch) {
        const vectorStr = pgvector.toSql(chunk.embedding) as string;

        await this.sql`
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
  ): Promise<Array<{ id: string; score: number }>> {
    if (sourceId) {
      return await this.sql<Array<{ id: string; score: number }>>`
        SELECT id, ts_rank_cd(search_vector, query) AS score
        FROM chunks, plainto_tsquery('simple', ${query}) query
        WHERE search_vector @@ query
          AND source_id = ${sourceId}
        ORDER BY score DESC
        LIMIT ${limit}
      `;
    }

    return await this.sql<Array<{ id: string; score: number }>>`
      SELECT id, ts_rank_cd(search_vector, query) AS score
      FROM chunks, plainto_tsquery('simple', ${query}) query
      WHERE search_vector @@ query
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  // Векторный поиск по cosine distance.
  async searchVector(
    embedding: number[],
    limit: number,
    sourceId?: string,
  ): Promise<Array<{ id: string; score: number }>> {
    const vectorStr = `[${embedding.join(',')}]`;

    if (sourceId) {
      return await this.sql<Array<{ id: string; score: number }>>`
        SELECT id, 1 - (embedding <=> ${vectorStr}::vector) AS score
        FROM chunks
        WHERE embedding IS NOT NULL
          AND source_id = ${sourceId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    }

    return await this.sql<Array<{ id: string; score: number }>>`
      SELECT id, 1 - (embedding <=> ${vectorStr}::vector) AS score
      FROM chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
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
}
