// Сборка DI-графа индексации и оркестрация branch-aware pipeline.
import { resolve } from 'node:path';
import type postgres from 'postgres';
import type { AppConfig, SourceConfig } from '../config/index.js';
import {
  ChunkDispatcher,
  FixedSizeChunker,
  FallbackChunker,
  MarkdownChunker,
  TreeSitterChunker,
  type ChunkSizeConfig,
} from '../chunks/index.js';
import { createTextEmbedder } from '../embeddings/index.js';
import {
  ChunkStorage,
  ChunkContentStorage,
  FileBlobStorage,
  IndexedFileStorage,
  SourceStorage,
  SourceViewStorage,
} from '../storage/index.js';
import type { SourceViewRow } from '../storage/index.js';
import {
  cloneOrPull,
  scanLocalFiles,
  resolveRepoContext,
  getCurrentRef,
  listLocalBranches,
  getHeadCommit,
  getHeadTree,
  getSubtreeOid,
  isDirtyWorktree,
  computeSnapshotFingerprint,
  computeManifestHash,
} from '../sources/index.js';
import type { CurrentRef } from '../sources/index.js';
import { Indexer } from './indexer.js';
import { ConsoleProgress } from './progress.js';
import {
  detectViewChanges,
  sha256 as sha256File,
  type GitSnapshotContext,
  type PreviousViewState,
} from './incremental.js';

export interface IndexerRuntime {
  sourceStorage: SourceStorage;
  sourceViewStorage: SourceViewStorage;
  fileBlobStorage: FileBlobStorage;
  chunkContentStorage: ChunkContentStorage;
  indexedFileStorage: IndexedFileStorage;
  chunkStorage: ChunkStorage;
  indexer: Indexer;
  progress: ConsoleProgress;
  cloneDir: string;
}

// Git snapshot для текущего состояния рабочей директории.
export interface GitSnapshotInfo {
  repoRoot: string;
  repoSubpath: string | null;
  currentRef: CurrentRef;
  headCommitOid: string;
  headTreeOid: string;
  subtreeOid: string | null;
  dirty: boolean;
}

function createDispatcher(chunkSize: ChunkSizeConfig): ChunkDispatcher {
  const treeSitterChunker = new TreeSitterChunker(chunkSize);
  const fallbackChunker = new FallbackChunker(chunkSize);
  const markdownChunker = new MarkdownChunker(chunkSize);
  const fixedChunker = new FixedSizeChunker(chunkSize);
  return new ChunkDispatcher([treeSitterChunker, fallbackChunker, markdownChunker], fixedChunker);
}

// SHA-256 хэш строки — реэкспорт из incremental.
const sha256 = sha256File;

/**
 * Определяет git snapshot для пути.
 * Возвращает null если путь не внутри git-репозитория.
 */
export async function resolveGitSnapshot(localPath: string): Promise<GitSnapshotInfo | null> {
  const repoCtx = await resolveRepoContext(localPath);

  try {
    // getCurrentRef бросает исключение для non-git директорий.
    const currentRef = await getCurrentRef(repoCtx.repoRoot);

    const [headCommitOid, headTreeOid, dirty] = await Promise.all([
      getHeadCommit(repoCtx.repoRoot),
      getHeadTree(repoCtx.repoRoot),
      isDirtyWorktree(repoCtx.repoRoot),
    ]);

    const subtreeOid = repoCtx.repoSubpath
      ? await getSubtreeOid(repoCtx.repoRoot, repoCtx.repoSubpath)
      : null;

    console.log(
      `[runtime] git snapshot: ref=${currentRef.refName}, commit=${headCommitOid.slice(0, 12)}, ` +
      `tree=${headTreeOid.slice(0, 12)}, dirty=${dirty}, subpath=${repoCtx.repoSubpath ?? 'none'}`,
    );

    return {
      repoRoot: repoCtx.repoRoot,
      repoSubpath: repoCtx.repoSubpath,
      currentRef,
      headCommitOid,
      headTreeOid,
      subtreeOid,
      dirty,
    };
  } catch {
    console.log(`[runtime] ${localPath} — не git-репозиторий, используем workspace view`);
    return null;
  }
}

export function createIndexerRuntime(sql: postgres.Sql, config: AppConfig): IndexerRuntime {
  const sourceStorage = new SourceStorage(sql);
  const sourceViewStorage = new SourceViewStorage(sql);
  const fileBlobStorage = new FileBlobStorage(sql);
  const chunkContentStorage = new ChunkContentStorage(sql);
  const chunkStorage = new ChunkStorage(sql);
  const indexedFileStorage = new IndexedFileStorage(sql);
  const embedder = createTextEmbedder(config.embeddings);
  const dispatcher = createDispatcher(config.indexing.chunkSize);
  const progress = new ConsoleProgress();

  return {
    sourceStorage,
    sourceViewStorage,
    fileBlobStorage,
    chunkContentStorage,
    indexedFileStorage,
    chunkStorage,
    indexer: new Indexer(
      chunkStorage,
      sourceStorage,
      embedder,
      dispatcher,
      progress,
      indexedFileStorage,
      sourceViewStorage,
      fileBlobStorage,
      chunkContentStorage,
    ),
    progress,
    cloneDir: config.indexing.git.cloneDir,
  };
}

/**
 * Индексирует источник из конфигурации с branch-aware pipeline:
 * 1. Определяет локальный путь (clone для remote git).
 * 2. Определяет git snapshot (или workspace).
 * 3. Upsert логический source.
 * 4. Сканирует файлы.
 * 5. Вычисляет snapshot fingerprint.
 * 6. Upsert source_view.
 * 7. Reconcile branch views (удаление stale).
 * 8. Индексирует через Indexer.
 * 9. Финализация: обновляет view stats + active_view_id.
 */
export async function indexSourceFromConfig(
  sourceConfig: SourceConfig,
  runtime: IndexerRuntime,
): Promise<void> {
  const {
    sourceStorage,
    sourceViewStorage,
    chunkStorage,
    indexer,
    progress,
    cloneDir,
  } = runtime;

  // Шаг 1: Определяем локальный путь.
  let localPath: string;

  if (sourceConfig.type === 'git') {
    const url = sourceConfig.url;
    if (!url) {
      throw new Error(`Не указан URL для git-источника "${sourceConfig.name}"`);
    }
    const branch = sourceConfig.branch ?? 'main';
    console.log(`[runtime] clone/pull: ${url} (branch: ${branch})`);
    const { localPath: clonedPath } = await cloneOrPull(url, branch, cloneDir);
    localPath = clonedPath;
  } else {
    if (!sourceConfig.path) {
      throw new Error(`Не указан путь для источника "${sourceConfig.name}"`);
    }
    localPath = resolve(sourceConfig.path);
  }

  // Шаг 2: Определяем git snapshot.
  const gitInfo = await resolveGitSnapshot(localPath);
  const runtimePath = gitInfo
    ? `${gitInfo.currentRef.viewKind}:${gitInfo.currentRef.refName}` + (gitInfo.dirty ? ' (dirty)' : '')
    : 'workspace';
  console.log(`[runtime] resolved path: ${runtimePath}`);

  // Шаг 3: Upsert логический source.
  console.log(`[runtime] upsert source: name=${sourceConfig.name}, type=${sourceConfig.type}`);
  const source = await sourceStorage.upsertDefinition({
    name: sourceConfig.name,
    type: sourceConfig.type,
    path: localPath,
    gitUrl: sourceConfig.type === 'git' ? sourceConfig.url : undefined,
    repoRootPath: gitInfo?.repoRoot ?? undefined,
    repoSubpath: gitInfo?.repoSubpath ?? undefined,
    config: {
      include: sourceConfig.include,
      exclude: sourceConfig.exclude,
    },
  });

  // Шаг 4: Сканируем файлы.
  const { files, excludedCount } = await scanLocalFiles(localPath, {
    include: sourceConfig.include,
    exclude: sourceConfig.exclude,
  });
  progress.onScanComplete(files.length, excludedCount);

  // Шаг 5: Получаем предыдущее состояние view (до upsert).
  const viewKind = gitInfo?.currentRef.viewKind ?? 'workspace';
  const refName = gitInfo?.currentRef.refName ?? undefined;

  let existingView: SourceViewRow | null = null;
  if (viewKind === 'workspace') {
    existingView = await sourceViewStorage.getWorkspaceView(source.id);
  } else if (refName) {
    existingView = await sourceViewStorage.getRefView(source.id, viewKind, refName);
  }

  const previousViewState: PreviousViewState | undefined =
    existingView?.last_indexed_at
      ? {
        headCommitOid: existingView.head_commit_oid,
        headTreeOid: existingView.head_tree_oid,
        subtreeOid: existingView.subtree_oid,
        dirty: existingView.dirty,
      }
      : undefined;

  // Шаг 6: Вычисляем snapshot fingerprint.
  const snapshotFingerprint = computeViewFingerprint(gitInfo, files);

  // Шаг 7: Upsert source_view.
  console.log(
    `[runtime] upsert view: kind=${viewKind}, ref=${refName ?? 'null'}, fingerprint=${snapshotFingerprint.slice(0, 30)}...`,
  );

  const view = await sourceViewStorage.upsertView({
    sourceId: source.id,
    viewKind,
    refName,
    headCommitOid: gitInfo?.headCommitOid,
    headTreeOid: gitInfo?.headTreeOid,
    subtreeOid: gitInfo?.subtreeOid ?? undefined,
    dirty: gitInfo?.dirty ?? false,
    snapshotFingerprint,
  });

  // Шаг 8: Определяем изменения.
  const gitContext: GitSnapshotContext | undefined = gitInfo
    ? {
      repoRoot: gitInfo.repoRoot,
      repoSubpath: gitInfo.repoSubpath,
      headCommitOid: gitInfo.headCommitOid,
      headTreeOid: gitInfo.headTreeOid,
      subtreeOid: gitInfo.subtreeOid,
      dirty: gitInfo.dirty,
    }
    : undefined;

  const changeResult = await detectViewChanges({
    sourceView: view,
    previousViewState,
    gitContext,
    scannedFiles: files,
    indexedFileStorage: runtime.indexedFileStorage,
  });

  console.log(
    `[runtime] change detection: strategy=${changeResult.strategy}, ` +
    `changed=${changeResult.changedFiles.length}, deleted=${changeResult.deletedPaths.length}`,
  );

  // Шаг 9: Если skip — финализируем с текущими данными.
  if (changeResult.strategy === 'skip') {
    console.log('[runtime] skip: нет изменений, обновляем метаданные');
    await finalizeView(view, files.length, source.id, chunkStorage, sourceViewStorage, sourceStorage, snapshotFingerprint, gitInfo);
    return;
  }

  // Шаг 10: Reconcile branch views (удаление stale).
  if (gitInfo) {
    await reconcileBranchViews(source.id, gitInfo.repoRoot, sourceViewStorage);
  }

  // Шаг 11: Индексируем через branch-aware indexView.
  const result = await indexer.indexView(view, changeResult.changedFiles, changeResult.deletedPaths, {
    totalFileCount: files.length,
    unchangedFileCount: files.length - changeResult.changedFiles.length,
    strategy: changeResult.strategy,
  });

  console.log(`[runtime] indexView result: repaired=${result.repairedFiles ?? 0}`);

  // Шаг 12: Финализация — обновляем view stats и active_view_id.
  await finalizeView(view, files.length, source.id, chunkStorage, sourceViewStorage, sourceStorage, snapshotFingerprint, gitInfo);
}

/**
 * Вычисляет snapshot fingerprint на основе git info и scanned файлов.
 */
function computeViewFingerprint(
  gitInfo: GitSnapshotInfo | null,
  files: Array<{ relativePath: string; content: string }>,
): string {
  if (gitInfo && !gitInfo.dirty) {
    // Clean git — tree OID достаточен.
    return computeSnapshotFingerprint({
      viewKind: gitInfo.currentRef.viewKind,
      dirty: false,
      headTreeOid: gitInfo.headTreeOid,
    });
  }

  // Dirty git или workspace — нужен manifest hash из файлов.
  const manifestEntries = files.map((f) => ({
    path: f.relativePath,
    contentHash: sha256(f.content),
  }));
  const manifestHash = computeManifestHash(manifestEntries);

  if (gitInfo) {
    // Dirty git.
    return computeSnapshotFingerprint({
      viewKind: gitInfo.currentRef.viewKind,
      dirty: true,
      headCommitOid: gitInfo.headCommitOid,
      snapshotManifestHash: manifestHash,
    });
  }

  // Workspace (non-git).
  return computeSnapshotFingerprint({
    viewKind: 'workspace',
    dirty: false,
    snapshotManifestHash: manifestHash,
  });
}

/**
 * Reconcile branch views: удаляет stale branch views, которых больше нет локально.
 * Применяется только к view_kind = 'branch'. Detached views не затрагиваются.
 */
async function reconcileBranchViews(
  sourceId: string,
  repoRoot: string,
  sourceViewStorage: SourceViewStorage,
): Promise<void> {
  try {
    const branches = await listLocalBranches(repoRoot);
    const deleted = await sourceViewStorage.deleteMissingBranchViews(sourceId, branches);

    if (deleted.length > 0) {
      console.log(`[runtime] reconcile: удалено ${deleted.length} stale branch views`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[runtime] WARN: branch reconciliation failed: ${msg}`);
  }
}

/**
 * Финализация: обновляет view stats и устанавливает active_view_id.
 * active_view_id обновляется ТОЛЬКО после успешного finalize.
 */
async function finalizeView(
  view: SourceViewRow,
  fileCount: number,
  sourceId: string,
  chunkStorage: ChunkStorage,
  sourceViewStorage: SourceViewStorage,
  sourceStorage: SourceStorage,
  snapshotFingerprint: string,
  gitInfo: GitSnapshotInfo | null,
): Promise<void> {
  const chunkCount = await chunkStorage.countByView(view.id);

  console.log(
    `[runtime] finalize view: id=${view.id}, files=${fileCount}, chunks=${chunkCount}`,
  );

  await sourceViewStorage.updateAfterIndex({
    viewId: view.id,
    headCommitOid: gitInfo?.headCommitOid,
    headTreeOid: gitInfo?.headTreeOid,
    subtreeOid: gitInfo?.subtreeOid ?? undefined,
    dirty: gitInfo?.dirty ?? false,
    snapshotFingerprint,
    fileCount,
    chunkCount,
  });

  // Устанавливаем active_view_id после успешного finalize.
  await sourceStorage.setActiveView(sourceId, view.id);
  await sourceStorage.updateLastIndexedAt(sourceId);

  console.log(`[runtime] active_view_id set: sourceId=${sourceId}, viewId=${view.id}`);
}
