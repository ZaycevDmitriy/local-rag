// Миграция 006 — добавляет колонки summary и summary_embedding в chunk_contents
// и partial HNSW индекс для summary_embedding.
// Non-destructive: ALTER TABLE ADD COLUMN + CREATE INDEX с IF NOT EXISTS там, где возможно.
// Размерность summary_embedding совпадает с embedding (один embedder — один query_vector).
import type { Migration } from '../migrator.js';

// Фабрика миграции: принимает размерность вектора, совпадающую с основным embedder.
export function createSummarizationMigration(dimensions: number): Migration {
  return {
    name: '006_summarization',

    async up(sql) {
      console.error('[migration:006] Добавление колонок summary и summary_embedding в chunk_contents...');

      // Колонка summary — free-form текст от LLM, NULL = не сгенерирован.
      await sql`
        ALTER TABLE chunk_contents
          ADD COLUMN IF NOT EXISTS summary TEXT
      `;

      // Колонка summary_embedding — вектор summary, NULL = не сгенерирован.
      // Размерность совпадает с embedding.
      await sql.unsafe(
        `ALTER TABLE chunk_contents
           ADD COLUMN IF NOT EXISTS summary_embedding vector(${dimensions})`,
      );

      // Partial HNSW индекс: строится только по non-NULL summary_embedding.
      // Без WHERE пустая таблица с NULL-векторами сломает HNSW.
      console.error('[migration:006] Создание partial HNSW индекса по summary_embedding...');
      await sql`
        CREATE INDEX IF NOT EXISTS idx_chunk_contents_summary_embedding
          ON chunk_contents
          USING hnsw (summary_embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 200)
          WHERE summary_embedding IS NOT NULL
      `;

      console.error('[migration:006] Миграция 006 завершена.');
    },
  };
}
