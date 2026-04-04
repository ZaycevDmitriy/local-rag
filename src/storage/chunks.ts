// CRUD-операции для таблицы chunks (occurrence-level, branch-aware schema).
import type postgres from 'postgres';
import type { ChunkRow } from './schema.js';
import type { ChunkMetadata } from '../chunks/index.js';

// Вход для batch-вставки occurrence rows.
export interface ChunkOccurrenceInsert {
  sourceViewId: string;
  indexedFileId: string;
  chunkContentHash: string;
  path: string;
  sourceType: string;
  startLine?: number;
  endLine?: number;
  headerPath?: string;
  language?: string;
  ordinal: number;
  metadata?: Record<string, unknown>;
}

// Размер пачки для batch-операций.
const BATCH_SIZE = 100;

// Хранилище occurrence-level чанков.
export class ChunkStorage {
  constructor(private sql: postgres.Sql) {}

  // Вставляет occurrence rows пачками.
  // Также принимает legacy-формат для backward compatibility (до Task 5).
  async insertBatch(
    occurrences: ChunkOccurrenceInsert[] | Array<{
      sourceId: string;
      content: string;
      contentHash: string;
      metadata: ChunkMetadata;
      embedding: number[];
    }>,
  ): Promise<void> {
    // Если пришёл legacy-формат — пропускаем (indexer ещё не переписан).
    if (occurrences.length > 0 && 'sourceId' in occurrences[0]!) {
      console.log('[ChunkStorage] insertBatch: legacy format detected, skipping (до Task 5)');
      return;
    }

    const items = occurrences as ChunkOccurrenceInsert[];
    return this._insertBatchImpl(items);
  }

  // Внутренняя реализация batch-вставки occurrence rows.
  private async _insertBatchImpl(occurrences: ChunkOccurrenceInsert[]): Promise<void> {
    if (occurrences.length === 0) return;

    console.log(`[ChunkStorage] insertBatch: count=${occurrences.length}`);

    await this.sql.begin(async (tx) => {
      for (let i = 0; i < occurrences.length; i += BATCH_SIZE) {
        const batch = occurrences.slice(i, i + BATCH_SIZE);

        // 11 параметров на строку: source_view_id, indexed_file_id, chunk_content_hash,
        // path, source_type, start_line, end_line, header_path, language, ordinal, metadata.
        const valueClauses = batch.map((_, idx) => {
          const base = idx * 11;
          return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::integer, $${base + 7}::integer, $${base + 8}, $${base + 9}, $${base + 10}::integer, $${base + 11}::jsonb)`;
        }).join(', ');

        const params = batch.flatMap((o) => [
          o.sourceViewId,
          o.indexedFileId,
          o.chunkContentHash,
          o.path,
          o.sourceType,
          o.startLine ?? null,
          o.endLine ?? null,
          o.headerPath ?? null,
          o.language ?? null,
          o.ordinal,
          JSON.stringify(o.metadata ?? {}),
        ]);

        await tx.unsafe(
          `INSERT INTO chunks (source_view_id, indexed_file_id, chunk_content_hash, path, source_type, start_line, end_line, header_path, language, ordinal, metadata) VALUES ${valueClauses}`,
          params,
        );
      }
    });
  }

  // Удаляет все chunks, привязанные к указанным indexed_file_id.
  async deleteByIndexedFileIds(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;

    console.log(`[ChunkStorage] deleteByIndexedFileIds: count=${fileIds.length}`);

    await this.sql`
      DELETE FROM chunks WHERE indexed_file_id = ANY(${fileIds})
    `;
  }

  // Возвращает чанки по массиву ID в порядке переданных ID.
  // JOIN с chunk_contents для backward-compatible полей (content, embedding).
  async getByIds(ids: string[]): Promise<ChunkRow[]> {
    if (ids.length === 0) return [];

    const rows = await this.sql<ChunkRow[]>`
      SELECT
        c.*,
        cc.content AS content,
        cc.content_hash AS content_hash,
        cc.embedding AS embedding,
        sv.source_id AS source_id
      FROM chunks c
      INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
      INNER JOIN source_views sv ON sv.id = c.source_view_id
      WHERE c.id = ANY(${ids})
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

  // Находит чанк по view + path + headerPath.
  async findByHeaderPath(
    viewId: string,
    path: string,
    headerPath: string,
  ): Promise<ChunkRow | null> {
    const rows = await this.sql<ChunkRow[]>`
      SELECT
        c.*,
        cc.content AS content,
        cc.content_hash AS content_hash,
        cc.embedding AS embedding,
        sv.source_id AS source_id
      FROM chunks c
      INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
      INNER JOIN source_views sv ON sv.id = c.source_view_id
      WHERE c.source_view_id = ${viewId}
        AND c.path = ${path}
        AND c.header_path = ${headerPath}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  // Подсчёт чанков для view.
  async countByView(viewId: string): Promise<number> {
    const result = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM chunks WHERE source_view_id = ${viewId}
    `;

    return parseInt(result[0]!.count, 10);
  }

  /**
   * Возвращает уникальные content hashes из chunks, отфильтрованные по occurrence-level фильтрам.
   * Используется для narrow/broad mode selection в SearchCoordinator.
   */
  async getContentHashes(filters: {
    sourceViewIds: string[];
    sourceType?: string;
    pathPrefix?: string;
  }): Promise<string[]> {
    const { sourceViewIds, sourceType, pathPrefix } = filters;

    if (sourceViewIds.length === 0) return [];

    const rows = await this.sql<Array<{ chunk_content_hash: string }>>`
      SELECT DISTINCT chunk_content_hash
      FROM chunks
      WHERE source_view_id = ANY(${sourceViewIds})
        ${sourceType ? this.sql`AND source_type = ${sourceType}` : this.sql``}
        ${pathPrefix ? this.sql`AND path LIKE ${pathPrefix + '%'}` : this.sql``}
    `;

    console.log(`[ChunkStorage] getContentHashes: views=${sourceViewIds.length}, result=${rows.length}`);

    return rows.map((r) => r.chunk_content_hash);
  }

  /**
   * Resolves content hashes → один occurrence per hash per view.
   * Tie-break: path ASC, ordinal ASC.
   * Используется для content-level dedup перед RRF.
   */
  async resolveOccurrences(
    contentHashes: string[],
    sourceViewIds: string[],
    sourceType?: string,
    pathPrefix?: string,
  ): Promise<Array<{ id: string; chunk_content_hash: string; path: string; ordinal: number }>> {
    if (contentHashes.length === 0 || sourceViewIds.length === 0) return [];

    // DISTINCT ON (chunk_content_hash) с ORDER BY path, ordinal для детерминированного tie-break.
    const rows = await this.sql<Array<{ id: string; chunk_content_hash: string; path: string; ordinal: number }>>`
      SELECT DISTINCT ON (chunk_content_hash) id, chunk_content_hash, path, ordinal
      FROM chunks
      WHERE chunk_content_hash = ANY(${contentHashes})
        AND source_view_id = ANY(${sourceViewIds})
        ${sourceType ? this.sql`AND source_type = ${sourceType}` : this.sql``}
        ${pathPrefix ? this.sql`AND path LIKE ${pathPrefix + '%'}` : this.sql``}
      ORDER BY chunk_content_hash, path, ordinal
    `;

    console.log(`[ChunkStorage] resolveOccurrences: input=${contentHashes.length}, result=${rows.length}`);

    return rows;
  }

  // @deprecated — legacy search stubs. Сохранены для обратной совместимости с тестами.
  async searchBm25(
    _query: string,
    _limit: number,
    _sourceId?: string,
    _sourceType?: string,
    _pathPrefix?: string,
  ): Promise<Array<{ id: string; score: number }>> {
    throw new Error('Branch-aware search: используйте ChunkContentStorage.searchBm25 + resolveOccurrences');
  }

  // @deprecated — legacy search stub.
  async searchVector(
    _embedding: number[],
    _limit: number,
    _sourceId?: string,
    _sourceType?: string,
    _pathPrefix?: string,
  ): Promise<Array<{ id: string; score: number }>> {
    throw new Error('Branch-aware search: используйте ChunkContentStorage.searchVector + resolveOccurrences');
  }

  // @deprecated — backward-compatible метод. Удалить после Task 5.
  async countBySource(sourceId: string): Promise<number> {
    const result = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM chunks c
      INNER JOIN source_views sv ON sv.id = c.source_view_id
      WHERE sv.source_id = ${sourceId}
    `;

    return parseInt(result[0]!.count, 10);
  }

  // @deprecated — backward-compatible метод. Удалить после Task 5.
  async deleteBySource(sourceId: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM chunks c
      USING source_views sv
      WHERE sv.id = c.source_view_id AND sv.source_id = ${sourceId}
    `;

    return result.count;
  }

  // @deprecated — backward-compatible метод. Удалить после Task 5.
  async deleteByPath(sourceId: string, path: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM chunks c
      USING source_views sv
      WHERE sv.id = c.source_view_id
        AND sv.source_id = ${sourceId}
        AND c.path = ${path}
    `;

    return result.count;
  }

  // @deprecated — backward-compatible. Удалить после Task 5/7.
  async getChunksForReEmbed(options: {
    sourceId?: string;
    force: boolean;
    limit: number;
    offset: number;
  }): Promise<ChunkRow[]> {
    const { sourceId, force, limit, offset } = options;

    return await this.sql<ChunkRow[]>`
      SELECT
        c.*,
        cc.content AS content,
        cc.content_hash AS content_hash,
        cc.embedding AS embedding,
        sv.source_id AS source_id
      FROM chunks c
      INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
      INNER JOIN source_views sv ON sv.id = c.source_view_id
      WHERE TRUE
        ${!force ? this.sql`AND cc.embedding IS NULL` : this.sql``}
        ${sourceId ? this.sql`AND sv.source_id = ${sourceId}` : this.sql``}
      ORDER BY c.created_at
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }

  // @deprecated — backward-compatible. Удалить после Task 5/7.
  async updateEmbedding(_chunkId: string, _embedding: number[]): Promise<void> {
    throw new Error('Branch-aware: используйте ChunkContentStorage.updateEmbeddings');
  }

  // @deprecated — backward-compatible. Удалить после Task 5/7.
  async countForReEmbed(sourceId?: string, force?: boolean): Promise<number> {
    const result = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count
      FROM chunks c
      INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
      INNER JOIN source_views sv ON sv.id = c.source_view_id
      WHERE TRUE
        ${!force ? this.sql`AND cc.embedding IS NULL` : this.sql``}
        ${sourceId ? this.sql`AND sv.source_id = ${sourceId}` : this.sql``}
    `;

    return parseInt(result[0]!.count, 10);
  }
}
