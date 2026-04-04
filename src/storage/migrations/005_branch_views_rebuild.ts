// Миграция для branch-aware storage: источники, views, blobs, content dedup, occurrence chunks.
// Destructive cutover: DROP + CREATE для всех таблиц (кроме _migrations).
// Реализована как factory function, т.к. chunk_contents.embedding зависит от runtime-размерности.
import type { Migration } from '../migrator.js';

// Фабрика миграции: создаёт migration с заданной размерностью вектора для chunk_contents.embedding.
export function createBranchViewsRebuildMigration(dimensions: number): Migration {
  return {
    name: '005_branch_views_rebuild',

    async up(sql) {
      console.log('[migration:005] Начало destructive cutover — branch-aware schema...');

      // --- DROP существующих таблиц (порядок: дети → родители). ---
      console.log('[migration:005] Удаление старых таблиц...');
      await sql`DROP TABLE IF EXISTS chunks CASCADE`;
      await sql`DROP TABLE IF EXISTS indexed_files CASCADE`;
      await sql`DROP TABLE IF EXISTS sources CASCADE`;

      // --- Создание таблиц (порядок: родители → дети). ---

      // 1. sources — логический источник данных.
      console.log('[migration:005] Создание таблицы sources...');
      await sql`
        CREATE TABLE sources (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name            TEXT NOT NULL UNIQUE,
          type            TEXT NOT NULL,
          path            TEXT,
          git_url         TEXT,
          repo_root_path  TEXT,
          repo_subpath    TEXT,
          active_view_id  UUID,
          config          JSONB NOT NULL DEFAULT '{}',
          last_indexed_at TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // 2. source_views — материализованный snapshot (branch/detached/workspace).
      console.log('[migration:005] Создание таблицы source_views...');
      await sql`
        CREATE TABLE source_views (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_id             UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          view_kind             TEXT NOT NULL,
          ref_name              TEXT,
          head_commit_oid       TEXT,
          head_tree_oid         TEXT,
          subtree_oid           TEXT,
          dirty                 BOOLEAN NOT NULL DEFAULT FALSE,
          snapshot_fingerprint  TEXT NOT NULL,
          file_count            INTEGER NOT NULL DEFAULT 0,
          chunk_count           INTEGER NOT NULL DEFAULT 0,
          last_seen_at          TIMESTAMPTZ,
          last_indexed_at       TIMESTAMPTZ,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // Уникальные ограничения и индексы для source_views.
      await sql`CREATE UNIQUE INDEX idx_source_views_source_id ON source_views(source_id, id)`;
      await sql`CREATE UNIQUE INDEX idx_source_views_ref ON source_views(source_id, view_kind, ref_name)`;
      await sql`
        CREATE UNIQUE INDEX idx_source_views_workspace
          ON source_views(source_id, view_kind)
          WHERE view_kind = 'workspace'
      `;

      // Composite FK: sources.active_view_id → source_views(source_id, id).
      await sql`
        ALTER TABLE sources
          ADD CONSTRAINT fk_sources_active_view
          FOREIGN KEY (id, active_view_id)
          REFERENCES source_views(source_id, id)
          ON DELETE SET NULL
      `;

      // 3. file_blobs — дедуплицированные тела файлов для snapshot-based read_source.
      console.log('[migration:005] Создание таблицы file_blobs...');
      await sql`
        CREATE TABLE file_blobs (
          content_hash  TEXT PRIMARY KEY,
          content       TEXT NOT NULL,
          byte_size     INTEGER NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // 4. indexed_files — файлы, проиндексированные в рамках конкретного view.
      console.log('[migration:005] Создание таблицы indexed_files...');
      await sql`
        CREATE TABLE indexed_files (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_view_id    UUID NOT NULL REFERENCES source_views(id) ON DELETE CASCADE,
          path              TEXT NOT NULL,
          content_hash      TEXT NOT NULL REFERENCES file_blobs(content_hash),
          indexed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (source_view_id, path)
        )
      `;

      // Опорный ключ для composite FK из chunks.
      await sql`CREATE UNIQUE INDEX idx_indexed_files_view_id ON indexed_files(source_view_id, id)`;

      // 5. chunk_contents — дедуплицированное содержимое чанков с embedding и search_vector.
      console.log('[migration:005] Создание таблицы chunk_contents...');
      await sql`
        CREATE TABLE chunk_contents (
          content_hash    TEXT PRIMARY KEY,
          content         TEXT NOT NULL,
          embedding       vector(${sql.unsafe(String(dimensions))}),
          search_vector   tsvector
            GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // HNSW-индекс на embedding, GIN-индекс на search_vector.
      await sql`
        CREATE INDEX idx_chunk_contents_embedding ON chunk_contents
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 200)
      `;
      await sql`CREATE INDEX idx_chunk_contents_fts ON chunk_contents USING GIN (search_vector)`;

      // 6. chunks — occurrence-level строки, привязанные к view и файлу.
      console.log('[migration:005] Создание таблицы chunks...');
      await sql`
        CREATE TABLE chunks (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_view_id      UUID NOT NULL,
          indexed_file_id     UUID NOT NULL,
          chunk_content_hash  TEXT NOT NULL REFERENCES chunk_contents(content_hash) ON DELETE RESTRICT,
          path                TEXT NOT NULL,
          source_type         TEXT NOT NULL,
          start_line          INTEGER,
          end_line            INTEGER,
          header_path         TEXT,
          language            TEXT,
          ordinal             INTEGER NOT NULL,
          metadata            JSONB NOT NULL DEFAULT '{}',
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (indexed_file_id, ordinal)
        )
      `;

      // Composite FK: chunks → indexed_files(source_view_id, id).
      await sql`
        ALTER TABLE chunks
          ADD CONSTRAINT fk_chunks_indexed_file
          FOREIGN KEY (source_view_id, indexed_file_id)
          REFERENCES indexed_files(source_view_id, id)
          ON DELETE CASCADE
      `;

      // Индексы для chunks.
      await sql`CREATE INDEX idx_chunks_view ON chunks(source_view_id)`;
      await sql`CREATE INDEX idx_chunks_content_hash ON chunks(chunk_content_hash)`;
      await sql`CREATE INDEX idx_chunks_indexed_file ON chunks(indexed_file_id)`;
      await sql`CREATE INDEX idx_chunks_path ON chunks(source_view_id, path)`;

      console.log('[migration:005] Destructive cutover завершён. Требуется полная переиндексация.');
    },
  };
}
