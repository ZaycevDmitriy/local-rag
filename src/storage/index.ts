// Barrel-файл модуля хранения.
export { createDb, closeDb } from './db.js';

export type { SourceRow, ChunkRow, IndexedFileRow } from './schema.js';

export type { Migration } from './migrator.js';
export { runMigrations, getAppliedMigrations } from './migrator.js';

export { default as initialMigration } from './migrations/001_initial.js';
export { createVectorDimensionsMigration } from './migrations/002_vector_dimensions.js';
export { default as pathIndexMigration } from './migrations/003_path_index.js';

export { SourceStorage } from './sources.js';
export { ChunkStorage } from './chunks.js';
export { IndexedFileStorage } from './indexed-files.js';
