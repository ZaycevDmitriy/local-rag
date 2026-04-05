// Обнаружение изменённых файлов для инкрементальной индексации.
import { createHash } from 'node:crypto';
import type { IndexedFileStorage, SourceViewRow } from '../storage/index.js';
import type { ScannedFile } from '../sources/index.js';
import {
  getCommittedDiffPaths,
  getTrackedWorktreeChanges,
  getUntrackedFiles,
  isAncestor,
} from '../sources/index.js';

// Описание изменённого файла.
export interface FileChange {
  path: string;
  absolutePath: string;
  content: string;
  hash: string;
  status: 'added' | 'modified';
}

// Результат обнаружения изменений (legacy).
export interface ChangeDetectionResult {
  changed: FileChange[];
  unchanged: number;
  deleted: string[];
}

// --- Branch-aware change detection (Task 5). ---

// Контекст git snapshot для определения стратегии.
export interface GitSnapshotContext {
  repoRoot: string;
  repoSubpath: string | null;
  headCommitOid: string;
  headTreeOid: string;
  subtreeOid: string | null;
  dirty: boolean;
}

// Изменённый файл для indexView.
export interface ChangedFile {
  path: string;
  content: string;
  contentHash: string;
}

// Результат определения изменений для view.
export interface ViewChangeResult {
  changedFiles: ChangedFile[];
  deletedPaths: string[];
  strategy: 'full-scan' | 'diff-scan' | 'skip';
}

// Предыдущее состояние view из БД.
export interface PreviousViewState {
  headCommitOid: string | null;
  headTreeOid: string | null;
  subtreeOid: string | null;
  dirty: boolean;
}

// Параметры для определения изменений view.
export interface ViewChangeDetectionParams {
  sourceView: SourceViewRow;
  previousViewState?: PreviousViewState;
  gitContext?: GitSnapshotContext;
  scannedFiles: ScannedFile[];
  indexedFileStorage: IndexedFileStorage;
}

// Вычисляет SHA-256 хэш строки.
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Branch-aware определение изменений для source_view.
 *
 * Матрица стратегий:
 * 1. Новый view (нет previousViewState) → full-scan.
 * 2. Clean git, tree/subtree OID совпадает → skip.
 * 3. Clean git, ancestor relationship → diff-scan.
 * 4. Rebase/reset/non-ancestor → full-scan.
 * 5. Workspace / non-git → full-scan.
 */
export async function detectViewChanges(
  params: ViewChangeDetectionParams,
): Promise<ViewChangeResult> {
  const { previousViewState, gitContext, scannedFiles, sourceView, indexedFileStorage } = params;

  // 1. Новый view (никогда не индексировался).
  if (!previousViewState) {
    console.log('[incremental] full-scan: новый view, нет предыдущего состояния');
    return fullScanFromFiles(scannedFiles, sourceView.id, indexedFileStorage);
  }

  // Git-backed view.
  if (gitContext) {
    // 2. Skip check: tree/subtree OID совпадает и не dirty.
    if (!gitContext.dirty) {
      if (gitContext.subtreeOid && previousViewState.subtreeOid === gitContext.subtreeOid) {
        console.log('[incremental] skip: subtreeOid без изменений');
        return { changedFiles: [], deletedPaths: [], strategy: 'skip' };
      }
      if (!gitContext.subtreeOid && previousViewState.headTreeOid === gitContext.headTreeOid) {
        console.log('[incremental] skip: headTreeOid без изменений');
        return { changedFiles: [], deletedPaths: [], strategy: 'skip' };
      }
    }

    // 3. Ancestor check для diff-scan (только если предыдущий snapshot был clean).
    if (!previousViewState.dirty && previousViewState.headCommitOid) {
      try {
        const isAnc = await isAncestor(
          gitContext.repoRoot,
          previousViewState.headCommitOid,
          gitContext.headCommitOid,
        );
        if (isAnc) {
          return diffScanFromGit(params);
        }
      } catch {
        console.log('[incremental] ancestor check failed, fallback to full-scan');
      }
    }

    // 4. Non-ancestor или предыдущий был dirty → full-scan.
    console.log('[incremental] full-scan: non-ancestor или предыдущий dirty');
  } else {
    // 5. Workspace / non-git → full-scan.
    console.log('[incremental] full-scan: workspace (non-git)');
  }

  return fullScanFromFiles(scannedFiles, sourceView.id, indexedFileStorage);
}

/**
 * Full-scan: сравнивает hash-и scanned файлов с indexed_files.
 */
async function fullScanFromFiles(
  scannedFiles: ScannedFile[],
  viewId: string,
  indexedFileStorage: IndexedFileStorage,
): Promise<ViewChangeResult> {
  const indexed = await indexedFileStorage.getByView(viewId);
  const indexedMap = new Map(indexed.map((row) => [row.path, row.content_hash]));

  const changedFiles: ChangedFile[] = [];
  const currentPaths = new Set<string>();

  for (const file of scannedFiles) {
    const contentHash = sha256(file.content);
    currentPaths.add(file.relativePath);

    const savedHash = indexedMap.get(file.relativePath);
    if (savedHash === undefined || savedHash !== contentHash) {
      changedFiles.push({
        path: file.relativePath,
        content: file.content,
        contentHash,
      });
    }
  }

  // Файлы, которые были в индексе, но исчезли.
  const deletedPaths: string[] = [];
  for (const [path] of indexedMap) {
    if (!currentPaths.has(path)) {
      deletedPaths.push(path);
    }
  }

  console.log(
    `[incremental] full-scan: ${changedFiles.length} changed, ${deletedPaths.length} deleted, ` +
    `${scannedFiles.length - changedFiles.length} unchanged`,
  );

  return { changedFiles, deletedPaths, strategy: 'full-scan' };
}

/**
 * Diff-scan: использует git diff для определения изменений.
 * Применяется когда предыдущий commit — ancestor текущего.
 */
async function diffScanFromGit(
  params: ViewChangeDetectionParams,
): Promise<ViewChangeResult> {
  const { previousViewState, gitContext, scannedFiles } = params;

  if (!gitContext || !previousViewState?.headCommitOid) {
    throw new Error('[incremental] diffScan requires gitContext and previousViewState');
  }

  // 1. Committed diff paths.
  const committedPaths = await getCommittedDiffPaths(
    gitContext.repoRoot,
    previousViewState.headCommitOid,
    gitContext.headCommitOid,
    gitContext.repoSubpath ?? undefined,
  );

  // 2. Если текущий dirty — добавляем tracked changes и untracked files.
  let dirtyPaths: string[] = [];
  if (gitContext.dirty) {
    const tracked = await getTrackedWorktreeChanges(
      gitContext.repoRoot,
      gitContext.repoSubpath ?? undefined,
    );
    const untracked = await getUntrackedFiles(
      gitContext.repoRoot,
      gitContext.repoSubpath ?? undefined,
    );
    dirtyPaths = [...tracked, ...untracked];
  }

  // Объединяем все потенциально изменённые пути.
  const affectedPathSet = new Set([...committedPaths, ...dirtyPaths]);

  console.log(
    `[incremental] diff-scan: committed=${committedPaths.length}, dirty=${dirtyPaths.length}, ` +
    `total affected=${affectedPathSet.size}`,
  );

  // Индексируем scannedFiles для быстрого поиска.
  const scannedMap = new Map(scannedFiles.map((f) => [f.relativePath, f]));

  const changedFiles: ChangedFile[] = [];
  const deletedPaths: string[] = [];

  for (const path of affectedPathSet) {
    const scanned = scannedMap.get(path);
    if (scanned) {
      changedFiles.push({
        path: scanned.relativePath,
        content: scanned.content,
        contentHash: sha256(scanned.content),
      });
    } else {
      // Файл удалён или excluded.
      deletedPaths.push(path);
    }
  }

  console.log(
    `[incremental] diff-scan result: ${changedFiles.length} changed, ${deletedPaths.length} deleted`,
  );

  return { changedFiles, deletedPaths, strategy: 'diff-scan' };
}

// --- Legacy API (deprecated, для обратной совместимости до полной миграции). ---

/**
 * @deprecated Используйте detectViewChanges.
 */
export async function detectChanges(
  sourceId: string,
  files: ScannedFile[],
  storage: IndexedFileStorage,
): Promise<ChangeDetectionResult> {
  console.log('[incremental] WARN: legacy detectChanges called');

  const indexed = await storage.getBySource(sourceId);
  const indexedMap = new Map(indexed.map((row) => [row.path, row.file_hash]));

  const changed: FileChange[] = [];
  let unchanged = 0;
  const currentPaths = new Set<string>();

  for (const file of files) {
    const hash = sha256(file.content);
    currentPaths.add(file.relativePath);

    const savedHash = indexedMap.get(file.relativePath);

    if (savedHash === undefined) {
      changed.push({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        content: file.content,
        hash,
        status: 'added',
      });
    } else if (savedHash !== hash) {
      changed.push({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        content: file.content,
        hash,
        status: 'modified',
      });
    } else {
      unchanged++;
    }
  }

  const deleted: string[] = [];
  for (const [path] of indexedMap) {
    if (!currentPaths.has(path)) {
      deleted.push(path);
    }
  }

  return { changed, unchanged, deleted };
}
