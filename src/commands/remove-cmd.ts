// Команда rag remove — удаление источника данных.
// CASCADE в schema удаляет source_views → indexed_files → chunks автоматически.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, SourceStorage } from '../storage/index.js';

export const removeCommand = new Command('remove')
  .description('Remove an indexed source and all its chunks')
  .argument('<name>', 'Source name to remove')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (name: string, options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const sourceStorage = new SourceStorage(sql);

        const source = await sourceStorage.getByName(name);
        if (!source) {
          console.error(`Источник "${name}" не найден.`);
          process.exit(1);
        }

        // Удаляем источник (CASCADE удалит views, indexed_files, chunks).
        await sourceStorage.remove(source.id);

        console.log(`Источник "${name}" удалён.`);
        console.log('  Orphan file_blobs и chunk_contents можно очистить через `rag gc`.');
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка команды rag remove для источника "${name}": ${message}`);
      process.exit(1);
    }
  });
