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
import { ChunkStorage, IndexedFileStorage, SourceStorage } from '../storage/index.js';
import { cloneOrPull, scanLocalFiles } from '../sources/index.js';
import { Indexer } from './indexer.js';
import { ConsoleProgress } from './progress.js';

export interface IndexerRuntime {
  sourceStorage: SourceStorage;
  indexer: Indexer;
  progress: ConsoleProgress;
  cloneDir: string;
}

function createDispatcher(chunkSize: ChunkSizeConfig): ChunkDispatcher {
  const treeSitterChunker = new TreeSitterChunker(chunkSize);
  const fallbackChunker = new FallbackChunker(chunkSize);
  const markdownChunker = new MarkdownChunker(chunkSize);
  const fixedChunker = new FixedSizeChunker(chunkSize);
  return new ChunkDispatcher([treeSitterChunker, fallbackChunker, markdownChunker], fixedChunker);
}

export function createIndexerRuntime(sql: postgres.Sql, config: AppConfig): IndexerRuntime {
  const sourceStorage = new SourceStorage(sql);
  const chunkStorage = new ChunkStorage(sql);
  const indexedFileStorage = new IndexedFileStorage(sql);
  const embedder = createTextEmbedder(config.embeddings);
  const dispatcher = createDispatcher(config.indexing.chunkSize);
  const progress = new ConsoleProgress();

  return {
    sourceStorage,
    indexer: new Indexer(
      chunkStorage,
      sourceStorage,
      embedder,
      dispatcher,
      progress,
      indexedFileStorage,
    ),
    progress,
    cloneDir: config.indexing.git.cloneDir,
  };
}

export async function indexSourceFromConfig(
  sourceConfig: SourceConfig,
  runtime: IndexerRuntime,
): Promise<void> {
  const { sourceStorage, indexer, progress, cloneDir } = runtime;

  if (sourceConfig.type === 'git') {
    const url = sourceConfig.url;
    if (!url) {
      throw new Error(`Не указан URL для git-источника "${sourceConfig.name}"`);
    }

    const branch = sourceConfig.branch ?? 'main';
    const { localPath } = await cloneOrPull(url, branch, cloneDir);
    const source = await sourceStorage.upsert({
      name: sourceConfig.name,
      type: 'git',
      path: localPath,
      gitUrl: url,
      gitBranch: branch,
      config: {
        include: sourceConfig.include,
        exclude: sourceConfig.exclude,
      },
    });

    const { files, excludedCount } = await scanLocalFiles(localPath, {
      include: sourceConfig.include,
      exclude: sourceConfig.exclude,
    });
    progress.onScanComplete(files.length, excludedCount);
    await indexer.indexSource(source, files);
    return;
  }

  if (!sourceConfig.path) {
    throw new Error(`Не указан путь для источника "${sourceConfig.name}"`);
  }

  const resolvedPath = resolve(sourceConfig.path);
  const source = await sourceStorage.upsert({
    name: sourceConfig.name,
    type: sourceConfig.type,
    path: resolvedPath,
    config: {
      include: sourceConfig.include,
      exclude: sourceConfig.exclude,
    },
  });

  const { files, excludedCount } = await scanLocalFiles(resolvedPath, {
    include: sourceConfig.include,
    exclude: sourceConfig.exclude,
  });
  progress.onScanComplete(files.length, excludedCount);
  await indexer.indexSource(source, files);
}
