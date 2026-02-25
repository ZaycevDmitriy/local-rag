// TypeScript-типы строк таблиц PostgreSQL.

// Строка таблицы sources — источник данных.
export interface SourceRow {
  id: string;
  name: string;
  type: 'local' | 'git';
  path: string | null;
  git_url: string | null;
  git_branch: string | null;
  config: Record<string, unknown>;
  last_indexed_at: Date | null;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
}

// Строка таблицы chunks — фрагмент с эмбеддингом.
export interface ChunkRow {
  id: string;
  source_id: string;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  created_at: Date;
}

// Строка таблицы indexed_files — хэш файла для инкрементальной индексации.
export interface IndexedFileRow {
  id: string;
  source_id: string;
  path: string;
  file_hash: string;
  indexed_at: Date;
}
