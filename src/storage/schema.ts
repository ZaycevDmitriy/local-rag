// TypeScript-типы строк таблиц PostgreSQL (branch-aware schema).

// Строка таблицы sources — логический источник данных.
export interface SourceRow {
  id: string;
  name: string;
  type: 'local' | 'git';
  path: string | null;
  git_url: string | null;
  repo_root_path: string | null;
  repo_subpath: string | null;
  active_view_id: string | null;
  config: Record<string, unknown>;
  last_indexed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // @deprecated — удалены в миграции 005. Сохранены для компиляции до Task 2.
  git_branch: string | null;
  chunk_count: number;
}

// Строка таблицы source_views — материализованный snapshot (branch/detached/workspace).
export interface SourceViewRow {
  id: string;
  source_id: string;
  view_kind: 'branch' | 'detached' | 'workspace';
  ref_name: string | null;
  head_commit_oid: string | null;
  head_tree_oid: string | null;
  subtree_oid: string | null;
  dirty: boolean;
  snapshot_fingerprint: string;
  file_count: number;
  chunk_count: number;
  last_seen_at: Date | null;
  last_indexed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Строка таблицы file_blobs — дедуплицированное тело файла.
export interface FileBlobRow {
  content_hash: string;
  content: string;
  byte_size: number;
  created_at: Date;
}

// Строка таблицы indexed_files — файл, проиндексированный в рамках view.
export interface IndexedFileRow {
  id: string;
  source_view_id: string;
  path: string;
  content_hash: string;
  indexed_at: Date;
  // @deprecated — удалены в миграции 005. Сохранены для компиляции до Task 2.
  source_id: string;
  file_hash: string;
}

// Строка таблицы chunk_contents — дедуплицированное содержимое чанка с embedding.
// Поля summary и summary_embedding добавлены миграцией 006 (опциональны, могут быть NULL).
export interface ChunkContentRow {
  content_hash: string;
  content: string;
  embedding: number[] | null;
  summary: string | null;
  summary_embedding: number[] | null;
  created_at: Date;
}

// Строка таблицы chunks — occurrence-level запись, привязанная к view и файлу.
export interface ChunkRow {
  id: string;
  source_view_id: string;
  indexed_file_id: string;
  chunk_content_hash: string;
  path: string;
  source_type: string;
  start_line: number | null;
  end_line: number | null;
  header_path: string | null;
  language: string | null;
  ordinal: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  // @deprecated — удалены в миграции 005. Сохранены для компиляции до Task 2/7/8.
  source_id: string;
  content: string;
  content_hash: string;
  embedding: number[] | null;
}
