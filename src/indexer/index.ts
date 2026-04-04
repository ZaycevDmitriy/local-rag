// Barrel-файл модуля индексации.
export type { IndexResult, ProgressReporter } from './progress.js';
export { ConsoleProgress } from './progress.js';
export { Indexer } from './indexer.js';
export type {
  FileChange,
  ChangeDetectionResult,
  ChangedFile,
  ViewChangeResult,
  ViewChangeDetectionParams,
  GitSnapshotContext,
  PreviousViewState,
} from './incremental.js';
export { detectChanges, detectViewChanges, sha256 } from './incremental.js';
export type { IndexerRuntime, GitSnapshotInfo } from './runtime.js';
export { createIndexerRuntime, indexSourceFromConfig, resolveGitSnapshot } from './runtime.js';
