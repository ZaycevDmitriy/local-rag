// CRUD-операции для таблицы file_blobs (content-addressable файловое хранилище).
import type postgres from 'postgres';
import type { FileBlobRow } from './schema.js';

// Размер пачки для batch-вставки.
const BATCH_SIZE = 200;

// Хранилище дедуплицированных тел файлов.
export class FileBlobStorage {
  constructor(private sql: postgres.Sql) {}

  // Вставляет blobs пачками. Дедупликация через ON CONFLICT DO NOTHING.
  async upsertMany(
    blobs: Array<{ contentHash: string; content: string; byteSize: number }>,
  ): Promise<void> {
    if (blobs.length === 0) return;

    console.log(`[FileBlobStorage] upsertMany: count=${blobs.length}`);

    for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
      const batch = blobs.slice(i, i + BATCH_SIZE);

      // Multi-row INSERT с ON CONFLICT DO NOTHING для дедупликации.
      const valueClauses = batch.map((_, idx) => {
        const base = idx * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      }).join(', ');

      const params = batch.flatMap((b) => [
        b.contentHash,
        b.content,
        b.byteSize,
      ]);

      await this.sql.unsafe(
        `INSERT INTO file_blobs (content_hash, content, byte_size) VALUES ${valueClauses} ON CONFLICT (content_hash) DO NOTHING`,
        params,
      );
    }
  }

  // Возвращает blob по content_hash.
  async getByHash(hash: string): Promise<FileBlobRow | null> {
    const rows = await this.sql<FileBlobRow[]>`
      SELECT * FROM file_blobs WHERE content_hash = ${hash}
    `;

    return rows[0] ?? null;
  }

  // Удаляет orphan blobs, на которые не ссылается ни один indexed_file.
  // Grace period — минуты с момента создания (защита от race conditions).
  async deleteOrphans(gracePeriodMinutes = 60): Promise<number> {
    console.log(`[FileBlobStorage] deleteOrphans: gracePeriod=${gracePeriodMinutes}min`);

    const result = await this.sql`
      DELETE FROM file_blobs fb
      WHERE NOT EXISTS (
        SELECT 1 FROM indexed_files inf
        WHERE inf.content_hash = fb.content_hash
      )
      AND fb.created_at < now() - ${gracePeriodMinutes + ' minutes'}::interval
    `;

    console.log(`[FileBlobStorage] deleteOrphans: deleted=${result.count}`);

    return result.count;
  }
}
