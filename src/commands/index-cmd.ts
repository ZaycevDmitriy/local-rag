// Команда rag index — индексация источников.
import { loadConfig } from '../config/index.js';
import { Command } from 'commander';
import type { SourceConfig } from '../config/index.js';
import { setStrictAst } from '../chunks/index.js';
import { closeDb, createDb } from '../storage/index.js';
import { createIndexerRuntime, indexSourceFromConfig } from '../indexer/index.js';

// Параметры команды index.
interface IndexOptions {
  path?: string;
  name?: string;
  all?: boolean;
  config?: string;
  git?: string;
  branch?: string;
}

function logIndexStart(sourceConfig: SourceConfig): void {
  console.log(`\nИндексация: ${sourceConfig.name}`);
  if (sourceConfig.type === 'git' && sourceConfig.url) {
    const branch = sourceConfig.branch ?? 'main';
    console.log(`  Клонирование/обновление: ${sourceConfig.url} (ветка: ${branch})`);
  }
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
      setStrictAst(config.indexing.strictAst);
      const sql = createDb(config.database);

      try {
        const runtime = createIndexerRuntime(sql, config);

        if (options.all) {
          // Индексируем все источники из конфига.
          if (config.sources.length === 0) {
            console.log('Нет источников в конфигурации.');
            return;
          }

          console.log(`Индексация всех источников (${config.sources.length})...`);
          let okCount = 0;
          const failures: Array<{ name: string; error: string }> = [];

          for (const sourceConfig of config.sources) {
            try {
              logIndexStart(sourceConfig);
              await indexSourceFromConfig(sourceConfig, runtime);
              okCount++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`  Ошибка при индексации "${sourceConfig.name}": ${msg}`);
              failures.push({ name: sourceConfig.name, error: msg });
            }
          }

          // Итоговый summary.
          if (failures.length > 0) {
            console.log(`\nРезультат: ${okCount} ok, ${failures.length} failed`);
            for (const f of failures) {
              console.log(`  - ${f.name}: ${f.error}`);
            }
            if (okCount === 0) {
              process.exit(1);
            }
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
          logIndexStart(sourceConfig);
          await indexSourceFromConfig(sourceConfig, runtime);
        } else if (options.path) {
          // Ad-hoc индексация: --path + --name.
          const sourceName = options.name ?? nameArg ?? 'adhoc';
          const sourceConfig: SourceConfig = {
            name: sourceName,
            type: 'local',
            path: options.path,
          };
          logIndexStart(sourceConfig);
          await indexSourceFromConfig(sourceConfig, runtime);
        } else if (nameArg) {
          // Индексация источника по имени из конфига.
          const sourceConfig = config.sources.find((s) => s.name === nameArg);
          if (!sourceConfig) {
            console.error(`Источник "${nameArg}" не найден в конфигурации.`);
            process.exit(1);
          }
          logIndexStart(sourceConfig);
          await indexSourceFromConfig(sourceConfig, runtime);
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
