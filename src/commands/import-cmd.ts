// Команда rag import — импорт источников из архива.
import { Command } from 'commander';
import { access, copyFile } from 'node:fs/promises';
import { checkbox, confirm } from '@inquirer/prompts';
import { loadConfig, resolveConfigPath } from '../config/index.js';
import { createDb, closeDb } from '../storage/index.js';
import { importData, readManifest, unpackArchive } from '../export/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

export const importCommand = new Command('import')
  .description('Import sources from an archive')
  .argument('<file>', 'Path to archive file')
  .option('--all', 'Import all sources from archive')
  .option('--source <name...>', 'Import specific sources')
  .option('--force', 'Overwrite existing sources without asking')
  .option('--remap-path <mapping>', 'Remap base path (format: /old=/new)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (file: string, options: {
    all?: boolean;
    source?: string[];
    force?: boolean;
    remapPath?: string;
    config?: string;
  }) => {
    try {
      // Проверяем существование файла.
      try {
        await access(file);
      } catch {
        console.error(`Файл не найден: ${file}`);
        process.exit(1);
      }

      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        // Парсим --remap-path.
        let remapPath: { from: string; to: string } | undefined;
        if (options.remapPath) {
          const eqIndex = options.remapPath.indexOf('=');
          if (eqIndex === -1) {
            console.error('Формат --remap-path: /old/path=/new/path');
            process.exit(1);
          }
          remapPath = {
            from: options.remapPath.slice(0, eqIndex),
            to: options.remapPath.slice(eqIndex + 1),
          };
        }

        // Определяем источники.
        let sourceNames: string[] | 'all';

        if (options.all) {
          sourceNames = 'all';
        } else if (options.source) {
          sourceNames = options.source;
        } else {
          // Интерактивный выбор — читаем манифест.
          const tmpDir = await mkdtemp(join(tmpdir(), 'rag-preview-'));
          try {
            await unpackArchive(file, tmpDir);
            const manifest = await readManifest(tmpDir);

            const selected = await checkbox({
              message: 'Выберите источники для импорта:',
              choices: manifest.sources.map((s) => ({
                name: `${s.name} (${s.chunksCount} фрагментов, ${s.hasEmbeddings ? 'с эмбеддингами' : 'без эмбеддингов'})`,
                value: s.name,
                checked: true,
              })),
            });

            if (selected.length === 0) {
              console.log('Ничего не выбрано.');
              return;
            }
            sourceNames = selected;
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        }

        // Импорт.
        const result = await importData({
          sql,
          archivePath: file,
          sourceNames,
          force: !!options.force,
          remapPath,
          onProgress: (name, status) => {
            if (status === 'importing') {
              console.log(`Импорт: ${name}...`);
            } else if (status === 'done') {
              console.log(`  ${name} — готово`);
            } else if (status === 'skipped') {
              console.log(`  ${name} — пропущен`);
            }
          },
          onConflict: async (name, chunksCount) => {
            return await confirm({
              message: `Источник '${name}' уже существует (${chunksCount} фрагментов). Перезаписать?`,
              default: false,
            });
          },
        });

        // Импорт конфига.
        const configPath = await resolveConfigPath(options.config);
        if (configPath) {
          const tmpDir = await mkdtemp(join(tmpdir(), 'rag-cfg-'));
          try {
            await unpackArchive(file, tmpDir);
            const configInArchive = join(tmpDir, 'config.yaml');
            if (existsSync(configInArchive) && !options.force) {
              const importConfig = await confirm({
                message: 'Импортировать config.yaml? Текущий конфиг будет перезаписан.',
                default: false,
              });
              if (importConfig) {
                await copyFile(configInArchive, configPath);
                console.log('Конфиг импортирован.');
              }
            }
          } finally {
            await rm(tmpDir, { recursive: true, force: true });
          }
        }

        // Итог.
        console.log('\nИмпорт завершён:');
        console.log(`  Импортировано: ${result.sourcesImported}`);
        console.log(`  Пропущено: ${result.sourcesSkipped}`);
        console.log(`  Фрагментов: ${result.totalChunks}`);

        if (result.warnings.length > 0) {
          console.log('\nПредупреждения:');
          for (const warning of result.warnings) {
            console.log(`  ${warning}`);
          }
        }
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка: ${message}`);
      process.exit(1);
    }
  });
