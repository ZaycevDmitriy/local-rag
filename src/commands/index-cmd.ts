// Команда rag index — индексация источников.
import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig } from '../config/index.js';
import type { SourceConfig } from '../config/schema.js';
import { createDb, closeDb, SourceStorage, ChunkStorage, IndexedFileStorage } from '../storage/index.js';
import { createTextEmbedder } from '../embeddings/index.js';
import { ChunkDispatcher, MarkdownChunker, FixedSizeChunker, TreeSitterChunker, FallbackChunker } from '../chunks/index.js';
import { scanLocalFiles, cloneOrPull } from '../sources/index.js';
import { Indexer, ConsoleProgress } from '../indexer/index.js';

// Параметры команды index.
interface IndexOptions {
  path?: string;
  name?: string;
  all?: boolean;
  config?: string;
  git?: string;
  branch?: string;
}

// Создаёт ChunkDispatcher из конфигурации.
function createDispatcher(chunkSize: { maxTokens: number; overlap: number }): ChunkDispatcher {
  const treeSitterChunker = new TreeSitterChunker(chunkSize);
  const fallbackChunker = new FallbackChunker(chunkSize);
  const markdownChunker = new MarkdownChunker(chunkSize);
  const fixedChunker = new FixedSizeChunker(chunkSize);
  return new ChunkDispatcher([treeSitterChunker, fallbackChunker, markdownChunker], fixedChunker);
}

// Индексирует один источник.
async function indexSource(
  sourceConfig: SourceConfig,
  sourceStorage: SourceStorage,
  indexer: Indexer,
  progress: ConsoleProgress,
  cloneDir: string,
): Promise<void> {
  console.log(`\nИндексация: ${sourceConfig.name}`);

  if (sourceConfig.type === 'git') {
    const url = sourceConfig.url;
    if (!url) {
      console.error(`  Ошибка: URL не указан для git-источника "${sourceConfig.name}".`);
      return;
    }

    const branch = sourceConfig.branch ?? 'main';

    // Клонируем или обновляем репозиторий.
    console.log(`  Клонирование/обновление: ${url} (ветка: ${branch})`);
    const { localPath } = await cloneOrPull(url, branch, cloneDir);

    // Upsert источника в БД.
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

    // Сканируем файлы из локальной копии.
    const { files, excludedCount } = await scanLocalFiles(localPath, {
      include: sourceConfig.include,
      exclude: sourceConfig.exclude,
    });
    progress.onScanComplete(files.length, excludedCount);

    // Запускаем индексацию.
    await indexer.indexSource(source, files);
    return;
  }

  if (!sourceConfig.path) {
    console.error(`  Ошибка: путь не указан для источника "${sourceConfig.name}".`);
    return;
  }

  const resolvedPath = resolve(sourceConfig.path);

  // Upsert источника в БД.
  const source = await sourceStorage.upsert({
    name: sourceConfig.name,
    type: sourceConfig.type,
    path: resolvedPath,
    config: {
      include: sourceConfig.include,
      exclude: sourceConfig.exclude,
    },
  });

  // Сканируем файлы.
  const { files, excludedCount } = await scanLocalFiles(resolvedPath, {
    include: sourceConfig.include,
    exclude: sourceConfig.exclude,
  });
  progress.onScanComplete(files.length, excludedCount);

  // Запускаем индексацию.
  await indexer.indexSource(source, files);
}

export const indexCommand = new Command('index')
  .description('Index a source')
  .argument('[name]', 'Source name from config')
  .option('-p, --path <dir>', 'Path to local directory')
  .option('-n, --name <name>', 'Source name (for ad-hoc indexing)')
  .option('-a, --all', 'Index all sources from config')
  .option('-c, --config <path>', 'Path to config file')
  .option('-g, --git <url>', 'Git repository URL')
  .option('-b, --branch <branch>', 'Git branch (default: main)')
  .action(async (nameArg: string | undefined, options: IndexOptions) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const sourceStorage = new SourceStorage(sql);
        const chunkStorage = new ChunkStorage(sql);
        const indexedFileStorage = new IndexedFileStorage(sql);
        const embedder = createTextEmbedder(config.embeddings);
        const dispatcher = createDispatcher(config.indexing.chunkSize);
        const progress = new ConsoleProgress();
        const indexer = new Indexer(
          chunkStorage,
          sourceStorage,
          embedder,
          dispatcher,
          progress,
          indexedFileStorage,
        );
        const cloneDir = config.indexing.git.cloneDir;

        if (options.all) {
          // Индексируем все источники из конфига.
          if (config.sources.length === 0) {
            console.log('Нет источников в конфигурации.');
            return;
          }

          console.log(`Индексация всех источников (${config.sources.length})...`);
          for (const sourceConfig of config.sources) {
            await indexSource(sourceConfig, sourceStorage, indexer, progress, cloneDir);
          }
        } else if (options.git) {
          // Ad-hoc индексация git-репозитория: --git <url> + --name.
          const sourceName = options.name ?? nameArg ?? 'git-adhoc';
          const sourceConfig: SourceConfig = {
            name: sourceName,
            type: 'git',
            url: options.git,
            branch: options.branch,
          };
          await indexSource(sourceConfig, sourceStorage, indexer, progress, cloneDir);
        } else if (options.path) {
          // Ad-hoc индексация: --path + --name.
          const sourceName = options.name ?? nameArg ?? 'adhoc';
          const sourceConfig: SourceConfig = {
            name: sourceName,
            type: 'local',
            path: options.path,
          };
          await indexSource(sourceConfig, sourceStorage, indexer, progress, cloneDir);
        } else if (nameArg) {
          // Индексация источника по имени из конфига.
          const sourceConfig = config.sources.find((s) => s.name === nameArg);
          if (!sourceConfig) {
            console.error(`Источник "${nameArg}" не найден в конфигурации.`);
            process.exit(1);
          }
          await indexSource(sourceConfig, sourceStorage, indexer, progress, cloneDir);
        } else {
          console.error('Укажите источник: rag index <name>, --path <dir>, --git <url> или --all');
          process.exit(1);
        }

        console.log('\nИндексация завершена.');
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка индексации: ${message}`);
      process.exit(1);
    }
  });
