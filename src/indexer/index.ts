// Barrel-файл модуля индексации.
export type { IndexResult, ProgressReporter } from './progress.js';
export { ConsoleProgress } from './progress.js';
export { Indexer } from './indexer.js';
export type { FileChange, ChangeDetectionResult } from './incremental.js';
export { detectChanges } from './incremental.js';
export type { IndexerRuntime } from './runtime.js';
export { createIndexerRuntime, indexSourceFromConfig } from './runtime.js';
