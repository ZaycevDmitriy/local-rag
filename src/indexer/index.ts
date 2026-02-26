// Barrel-файл модуля индексации.
export type { IndexResult, ProgressReporter } from './progress.js';
export { ConsoleProgress } from './progress.js';
export { Indexer } from './indexer.js';
export type { FileChange, ChangeDetectionResult } from './incremental.js';
export { detectChanges } from './incremental.js';
