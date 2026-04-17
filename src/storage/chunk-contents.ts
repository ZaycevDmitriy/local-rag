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

  // Возвращает content rows с NULL summary для backfill-команды rag summarize.
  // Keyset pagination по content_hash: afterHash — курсор для продолжения после предыдущей пачки.
  async getWithNullSummary(
    limit: number,
    afterHash?: string,
  ): Promise<ChunkContentRow[]> {
    if (afterHash) {
      return await this.sql<ChunkContentRow[]>`
        SELECT * FROM chunk_contents
        WHERE summary IS NULL
          AND content_hash > ${afterHash}
        ORDER BY content_hash
        LIMIT ${limit}
      `;
    }

    return await this.sql<ChunkContentRow[]>`
      SELECT * FROM chunk_contents
      WHERE summary IS NULL
      ORDER BY content_hash
      LIMIT ${limit}
    `;
  }

  // Возвращает количество chunk_contents с NULL summary (для dry-run и прогресса).
  async countWithNullSummary(): Promise<number> {
    const rows = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM chunk_contents WHERE summary IS NULL
    `;
    return Number(rows[0]?.count ?? 0);
  }

  // Полный payload для summarize-команды: один content_hash + один representative
  // occurrence со всеми полями, нужными для prompt/gate.
  // Source-scoped, фильтр по source_type='code'.
  async getWithNullSummaryForSource(
    sourceId: string,
    limit: number,
    afterHash?: string,
  ): Promise<Array<{
    content_hash: string;
    content: string;
    path: string;
    source_type: string;
    language: string | null;
    metadata: Record<string, unknown>;
  }>> {
    const rows = await this.sql<Array<{
      content_hash: string;
      content: string;
      path: string;
      source_type: string;
      language: string | null;
      metadata: Record<string, unknown>;
    }>>`
      SELECT DISTINCT ON (cc.content_hash)
        cc.content_hash,
        cc.content,
        c.path,
        c.source_type,
        c.language,
        c.metadata
      FROM chunk_contents cc
      JOIN chunks c ON c.chunk_content_hash = cc.content_hash
      JOIN indexed_files f ON c.indexed_file_id = f.id
      JOIN source_views sv ON f.source_view_id = sv.id
      WHERE sv.source_id = ${sourceId}
        AND c.source_type = 'code'
        AND cc.summary IS NULL
        AND (${afterHash ?? null}::text IS NULL OR cc.content_hash > ${afterHash ?? null}::text)
      ORDER BY cc.content_hash
      LIMIT ${limit}
    `;

    return rows;
  }

  // Количество кандидатов на суммаризацию для source (до применения gates).
  async countWithNullSummaryForSource(sourceId: string): Promise<number> {
    const rows = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(DISTINCT cc.content_hash)::text AS count
      FROM chunk_contents cc
      JOIN chunks c ON c.chunk_content_hash = cc.content_hash
      JOIN indexed_files f ON c.indexed_file_id = f.id
      JOIN source_views sv ON f.source_view_id = sv.id
      WHERE sv.source_id = ${sourceId}
        AND c.source_type = 'code'
        AND cc.summary IS NULL
    `;

    return Number(rows[0]?.count ?? 0);
  }

  // Обновляет summary пачками (транзакция на batch). Принимает rows с contentHash → summary.
  async updateSummaries(
    updates: Array<{ contentHash: string; summary: string }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    console.error(`[ChunkContentStorage] updateSummaries: count=${updates.length}`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      await this.sql.begin(async (tx) => {
        for (const update of batch) {
          await tx.unsafe(
            'UPDATE chunk_contents SET summary = $1 WHERE content_hash = $2',
            [update.summary, update.contentHash],
          );
        }
      });
    }
  }

  // Обновляет summary_embedding пачками (транзакция на batch).
  async updateSummaryEmbeddings(
    updates: Array<{ contentHash: string; embedding: number[] }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    console.error(`[ChunkContentStorage] updateSummaryEmbeddings: count=${updates.length}`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      await this.sql.begin(async (tx) => {
        for (const update of batch) {
          const vectorStr = pgvector.toSql(update.embedding) as string;

          await tx.unsafe(
            'UPDATE chunk_contents SET summary_embedding = $1::vector WHERE content_hash = $2',
            [vectorStr, update.contentHash],
          );
        }
      });
    }
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

    console.error(`[ChunkContentStorage] searchBm25: query="${tsQuery}", limit=${limit}, prefilter=${contentHashes?.length ?? 'none'}`);

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

    console.error(`[ChunkContentStorage] searchVector: limit=${limit}, prefilter=${contentHashes?.length ?? 'none'}`);

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

  /**
   * Vector search по chunk_contents.summary_embedding через partial HNSW-индекс.
   * Строки с NULL summary_embedding игнорируются (graceful — partial index не включает их).
   * contentHashes — optional prefilter (narrow mode).
   */
  async searchSummaryVector(
    queryEmbedding: number[],
    limit: number,
    contentHashes?: string[],
  ): Promise<Array<{ contentHash: string; score: number }>> {
    const vectorStr = pgvector.toSql(queryEmbedding) as string;

    console.error(`[ChunkContentStorage] searchSummaryVector: limit=${limit}, prefilter=${contentHashes?.length ?? 'none'}`);

    if (contentHashes && contentHashes.length > 0) {
      // Narrow: exact search по prefiltered set (только non-NULL summary_embedding).
      const rows = await this.sql.unsafe<Array<{ content_hash: string; distance: number }>>(
        `SELECT content_hash, summary_embedding <=> $1::vector AS distance
         FROM chunk_contents
         WHERE summary_embedding IS NOT NULL
           AND content_hash = ANY($2)
         ORDER BY distance
         LIMIT $3`,
        [vectorStr, contentHashes, limit],
      );
      return rows.map((r) => ({ contentHash: r.content_hash, score: 1 - Number(r.distance) }));
    }

    // Broad: ANN по partial HNSW индексу (автоматически пропускает NULL).
    const rows = await this.sql.unsafe<Array<{ content_hash: string; distance: number }>>(
      `SELECT content_hash, summary_embedding <=> $1::vector AS distance
       FROM chunk_contents
       WHERE summary_embedding IS NOT NULL
       ORDER BY summary_embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit],
    );
    return rows.map((r) => ({ contentHash: r.content_hash, score: 1 - Number(r.distance) }));
  }

  // Возвращает true, если в source_view есть хотя бы один chunk_contents с non-NULL summary_embedding.
  // Используется SearchCoordinator для graceful fallback на 2-way.
  async hasSummaryForViews(sourceViewIds: string[]): Promise<boolean> {
    if (sourceViewIds.length === 0) return false;

    const rows = await this.sql<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM chunk_contents cc
        JOIN chunks c ON c.chunk_content_hash = cc.content_hash
        WHERE cc.summary_embedding IS NOT NULL
          AND c.source_view_id = ANY(${sourceViewIds})
      ) AS exists
    `;

    return rows[0]?.exists ?? false;
  }
}
