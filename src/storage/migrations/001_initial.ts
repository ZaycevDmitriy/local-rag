// Начальная миграция: расширение pgvector, таблицы sources, chunks, indexed_files.
import type { Migration } from '../migrator.js';

const migration: Migration = {
  name: '001_initial',

  async up(sql) {
    // Подключаем расширение pgvector.
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    // Таблица источников данных.
    await sql`
      CREATE TABLE sources (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          TEXT NOT NULL UNIQUE,
        type          TEXT NOT NULL,
        path          TEXT,
        git_url       TEXT,
        git_branch    TEXT,
        config        JSONB NOT NULL DEFAULT '{}',
        last_indexed_at TIMESTAMPTZ,
        chunk_count   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Таблица фрагментов с эмбеддингами и полнотекстовым поиском.
    await sql`
      CREATE TABLE chunks (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        content       TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        metadata      JSONB NOT NULL,
        embedding     vector(1024),
        search_vector tsvector
          GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Индексы для таблицы chunks.
    await sql`CREATE INDEX idx_chunks_source ON chunks(source_id)`;
    await sql`CREATE INDEX idx_chunks_hash ON chunks(source_id, content_hash)`;
    await sql`
      CREATE INDEX idx_chunks_embedding ON chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 200)
    `;
    await sql`CREATE INDEX idx_chunks_fts ON chunks USING GIN (search_vector)`;

    // Таблица хэшей файлов для инкрементальной индексации.
    await sql`
      CREATE TABLE indexed_files (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        path        TEXT NOT NULL,
        file_hash   TEXT NOT NULL,
        indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (source_id, path)
      )
    `;
  },
};

export default migration;
