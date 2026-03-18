// Миграция 004: индексы по metadata полям и составной индекс для keyset pagination.
import type { Migration } from '../migrator.js';

const migration: Migration = {
  name: '004_metadata_indexes',

  async up(sql) {
    // Индекс по sourceType для фильтрации чанков по типу.
    await sql`CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks ((metadata->>'sourceType'))`;
    // Индекс по language для фильтрации по языку.
    await sql`CREATE INDEX IF NOT EXISTS idx_chunks_language ON chunks ((metadata->>'language'))`;
    // Составной индекс для keyset pagination в export (включает id для полного покрытия ORDER BY created_at, id).
    await sql`CREATE INDEX IF NOT EXISTS idx_chunks_source_created ON chunks (source_id, created_at, id)`;
  },
};

export default migration;
