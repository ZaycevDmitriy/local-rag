// CRUD-операции для таблицы indexed_files.
import type postgres from 'postgres';
import type { IndexedFileRow } from './schema.js';

// Хранилище хэшей файлов для инкрементальной индексации.
export class IndexedFileStorage {
  constructor(private sql: postgres.Sql) {}

  // Возвращает все записи для источника.
  async getBySource(sourceId: string): Promise<IndexedFileRow[]> {
    return await this.sql<IndexedFileRow[]>`
      SELECT * FROM indexed_files WHERE source_id = ${sourceId}
    `;
  }

  // Создаёт или обновляет запись о файле (upsert по source_id + path).
  async upsert(sourceId: string, path: string, fileHash: string): Promise<void> {
    await this.sql`
      INSERT INTO indexed_files (source_id, path, file_hash)
      VALUES (${sourceId}, ${path}, ${fileHash})
      ON CONFLICT (source_id, path) DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        indexed_at = now()
    `;
  }

  // Удаляет все записи источника.
  async deleteBySource(sourceId: string): Promise<void> {
    await this.sql`
      DELETE FROM indexed_files WHERE source_id = ${sourceId}
    `;
  }

  // Удаляет запись о конкретном файле источника.
  async deleteByPath(sourceId: string, path: string): Promise<void> {
    await this.sql`
      DELETE FROM indexed_files
      WHERE source_id = ${sourceId} AND path = ${path}
    `;
  }
}
