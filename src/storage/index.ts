// Barrel-файл модуля хранения.
export { createDb, closeDb } from './db.js';

export type {
  SourceRow,
  SourceViewRow,
  FileBlobRow,
  IndexedFileRow,
  ChunkContentRow,
  ChunkRow,
} from './schema.js';

export type { Migration } from './migrator.js';
export { runMigrations, getAppliedMigrations } from './migrator.js';

export { default as initialMigration } from './migrations/001_initial.js';
export { createVectorDimensionsMigration } from './migrations/002_vector_dimensions.js';
export { default as pathIndexMigration } from './migrations/003_path_index.js';
export { default as metadataIndexesMigration } from './migrations/004_metadata_indexes.js';
export { createBranchViewsRebuildMigration } from './migrations/005_branch_views_rebuild.js';
export { createSummarizationMigration } from './migrations/006_summarization.js';

export { SourceStorage } from './sources.js';
export { SourceViewStorage } from './source-views.js';
export type { SourceViewUpsert, ViewAfterIndexUpdate } from './source-views.js';
export { FileBlobStorage } from './file-blobs.js';
export { IndexedFileStorage } from './indexed-files.js';
export type { IndexedFileUpsert } from './indexed-files.js';
export { ChunkContentStorage } from './chunk-contents.js';
export type { ChunkContentInsert } from './chunk-contents.js';
export { ChunkStorage } from './chunks.js';
export type { ChunkOccurrenceInsert } from './chunks.js';
