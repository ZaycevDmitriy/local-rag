// Команда rag export — экспорт источников в портативный архив.
import { Command } from 'commander';
import { checkbox } from '@inquirer/prompts';
import { loadConfig, resolveConfigPath } from '../config/index.js';
import { createDb, closeDb, SourceStorage } from '../storage/index.js';
import { exportData } from '../export/index.js';

// Форматирование размера файла.
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const exportCommand = new Command('export')
  .description('Export sources to a portable archive')
  .option('--all', 'Export all sources')
  .option('--source <name...>', 'Export specific sources')
  .option('--dry-run', 'Show export summary without exporting')
  .option('--no-embeddings', 'Exclude embeddings (smaller file)')
  .option('--no-compress', 'Disable gzip compression')
  .option('--output <path>', 'Output file path')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: {
    all?: boolean;
    source?: string[];
    dryRun?: boolean;
    embeddings: boolean;
    compress: boolean;
    output?: string;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const sourceStorage = new SourceStorage(sql);
        const allSources = await sourceStorage.getAll();

        if (allSources.length === 0) {
          console.log('Нет источников для экспорта.');
          return;
        }

        // Определяем источники для экспорта.
        let selectedIds: string[];

        if (options.all) {
          selectedIds = allSources.map((s) => s.id);
        } else if (options.source) {
          selectedIds = [];
          for (const name of options.source) {
            const source = allSources.find((s) => s.name === name);
            if (!source) {
              console.error(`Источник "${name}" не найден.`);
              process.exit(1);
            }
            selectedIds.push(source.id);
          }
        } else {
          // Интерактивный выбор.
          selectedIds = await checkbox({
            message: 'Выберите источники для экспорта:',
            choices: allSources.map((s) => ({
              name: `${s.name} (${s.chunk_count} фрагментов)`,
              value: s.id,
              checked: true,
            })),
          });

          if (selectedIds.length === 0) {
            console.log('Ничего не выбрано.');
            return;
          }
        }

        // Dry run — показать сводку.
        if (options.dryRun) {
          console.log('\nСводка экспорта:');
          let totalChunks = 0;
          for (const id of selectedIds) {
            const source = allSources.find((s) => s.id === id)!;
            console.log(`  ${source.name} (${source.chunk_count} фрагментов)`);
            totalChunks += source.chunk_count;
          }
          console.log(`\nВсего: ${selectedIds.length} источников, ${totalChunks} фрагментов`);
          console.log(`Эмбеддинги: ${options.embeddings ? 'включены' : 'исключены'}`);
          console.log(`Сжатие: ${options.compress ? 'gzip' : 'без сжатия'}`);
          return;
        }

        // Путь к выходному файлу.
        const now = new Date();
        const dateStr = now.toISOString().replace(/[T:]/g, '-').slice(0, 19);
        const ext = options.compress ? '.tar.gz' : '.tar';
        const outputPath = options.output ?? `./rag-export-${dateStr}${ext}`;

        // Путь к конфигу для санитизации.
        const configPath = await resolveConfigPath(options.config);

        // Прогресс.
        const result = await exportData({
          sql,
          sourceIds: selectedIds,
          includeEmbeddings: options.embeddings,
          compress: options.compress,
          outputPath,
          configPath,
          onProgress: (name, current, total) => {
            process.stdout.write(`\rЭкспорт ${name}... ${current}/${total} фрагментов`);
          },
        });

        console.log('');
        console.log('\nЭкспорт завершён:');
        console.log(`  Файл: ${result.archivePath}`);
        console.log(`  Размер: ${formatSize(result.fileSizeBytes)}`);
        console.log(`  Источников: ${result.sourcesExported}`);
        console.log(`  Фрагментов: ${result.totalChunks}`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка: ${message}`);
      process.exit(1);
    }
  });
