// Миграция 003: индекс по metadata->>'path' для фильтрации по pathPrefix.
import type { Migration } from '../migrator.js';

const migration: Migration = {
  name: '003_path_index',

  async up(sql) {
    // Подключаем расширение pg_trgm для GIN-индекса по тексту.
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    // Индекс по пути файла для быстрой фильтрации по префиксу.
    await sql`CREATE INDEX idx_chunks_path ON chunks USING GIN ((metadata->>'path') gin_trgm_ops)`;
  },
};

export default migration;
