// CRUD-операции для таблицы indexed_files (branch-aware schema).
import type postgres from 'postgres';
import type { IndexedFileRow } from './schema.js';

// Вход для batch-вставки файлов.
export interface IndexedFileUpsert {
  path: string;
  contentHash: string;
}

// Хранилище индексированных файлов для конкретного view.
export class IndexedFileStorage {
  constructor(private sql: postgres.Sql) {}

  // Возвращает все записи для view.
  async getByView(viewId: string): Promise<IndexedFileRow[]> {
    return await this.sql<IndexedFileRow[]>`
      SELECT * FROM indexed_files WHERE source_view_id = ${viewId}
    `;
  }

  // Возвращает файл по view + path.
  async getByPath(viewId: string, path: string): Promise<IndexedFileRow | null> {
    const rows = await this.sql<IndexedFileRow[]>`
      SELECT * FROM indexed_files
      WHERE source_view_id = ${viewId} AND path = ${path}
    `;

    return rows[0] ?? null;
  }

  // Вставляет или обновляет файлы пачкой. Возвращает все upserted rows.
  async upsertMany(
    viewId: string,
    files: IndexedFileUpsert[],
  ): Promise<IndexedFileRow[]> {
    if (files.length === 0) return [];

    console.log(`[IndexedFileStorage] upsertMany: viewId=${viewId}, count=${files.length}`);

    const results: IndexedFileRow[] = [];
    const BATCH_SIZE = 200;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      const valueClauses = batch.map((_, idx) => {
        const base = idx * 3;
        return `($${base + 1}::uuid, $${base + 2}, $${base + 3})`;
      }).join(', ');

      const params = batch.flatMap((f) => [viewId, f.path, f.contentHash]);

      const rows = await this.sql.unsafe<IndexedFileRow[]>(
        `INSERT INTO indexed_files (source_view_id, path, content_hash)
         VALUES ${valueClauses}
         ON CONFLICT (source_view_id, path) DO UPDATE SET
           content_hash = EXCLUDED.content_hash,
           indexed_at = now()
         RETURNING *`,
        params,
      );

      results.push(...rows);
    }

    return results;
  }

  // Удаляет файлы по путям внутри view.
  async deleteByPaths(viewId: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    console.log(`[IndexedFileStorage] deleteByPaths: viewId=${viewId}, count=${paths.length}`);

    await this.sql`
      DELETE FROM indexed_files
      WHERE source_view_id = ${viewId} AND path = ANY(${paths})
    `;
  }

  // Удаляет файлы по массиву ID.
  async deleteByIds(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;

    console.log(`[IndexedFileStorage] deleteByIds: count=${fileIds.length}`);

    await this.sql`
      DELETE FROM indexed_files WHERE id = ANY(${fileIds})
    `;
  }

  // @deprecated — backward-compatible методы. Удалить после переработки indexer (Task 5).
  async getBySource(sourceId: string): Promise<IndexedFileRow[]> {
    return await this.sql<IndexedFileRow[]>`
      SELECT inf.* FROM indexed_files inf
      INNER JOIN source_views sv ON sv.id = inf.source_view_id
      WHERE sv.source_id = ${sourceId}
    `;
  }

  // @deprecated — backward-compatible метод.
  async upsert(sourceId: string, path: string, fileHash: string): Promise<void> {
    // Ищем workspace view для backward compat.
    const views = await this.sql<Array<{ id: string }>>`
      SELECT id FROM source_views WHERE source_id = ${sourceId} LIMIT 1
    `;

    if (views.length === 0) return;

    await this.upsertMany(views[0]!.id, [{ path, contentHash: fileHash }]);
  }

  // @deprecated — backward-compatible метод.
  async deleteBySource(sourceId: string): Promise<void> {
    await this.sql`
      DELETE FROM indexed_files inf
      USING source_views sv
      WHERE inf.source_view_id = sv.id AND sv.source_id = ${sourceId}
    `;
  }

  // @deprecated — backward-compatible метод.
  async deleteByPath(sourceId: string, path: string): Promise<void> {
    await this.sql`
      DELETE FROM indexed_files inf
      USING source_views sv
      WHERE inf.source_view_id = sv.id
        AND sv.source_id = ${sourceId}
        AND inf.path = ${path}
    `;
  }
}
