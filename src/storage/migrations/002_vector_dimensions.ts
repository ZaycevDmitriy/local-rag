// Миграция для изменения размерности вектора эмбеддинга.
import type { Migration } from '../migrator.js';

// Фабрика миграции: создаёт migration с заданной размерностью вектора.
// Применяется один раз при изменении провайдера эмбеддингов.
export function createVectorDimensionsMigration(dimensions: number): Migration {
  return {
    name: '002_vector_dimensions',

    async up(sql) {
      // Удаляем HNSW-индекс перед изменением типа колонки.
      await sql`DROP INDEX IF EXISTS idx_chunks_embedding`;

      // Изменяем размерность вектора.
      await sql`
        ALTER TABLE chunks
          ALTER COLUMN embedding TYPE vector(${sql.unsafe(String(dimensions))})
      `;

      // Пересоздаём HNSW-индекс.
      await sql`
        CREATE INDEX idx_chunks_embedding ON chunks
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 200)
      `;
    },
  };
}
