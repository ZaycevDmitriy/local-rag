// Команда rag remove — удаление источника данных.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, SourceStorage, ChunkStorage, IndexedFileStorage } from '../storage/index.js';

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
        const chunkStorage = new ChunkStorage(sql);
        const indexedFileStorage = new IndexedFileStorage(sql);

        const source = await sourceStorage.getByName(name);
        if (!source) {
          console.error(`Источник "${name}" не найден.`);
          process.exit(1);
        }

        // Удаляем связанные данные.
        await indexedFileStorage.deleteBySource(source.id);
        const deletedChunks = await chunkStorage.deleteBySource(source.id);
        await sourceStorage.remove(name);

        console.log(`Источник "${name}" удалён (${deletedChunks} фрагментов).`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка: ${message}`);
      process.exit(1);
    }
  });
