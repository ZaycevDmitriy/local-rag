// Команда rag gc — сборка мусора: удаление orphan file_blobs и chunk_contents.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, FileBlobStorage, ChunkContentStorage } from '../storage/index.js';

export const gcCommand = new Command('gc')
  .description('Remove orphan file blobs and chunk contents')
  .option('-c, --config <path>', 'Path to config file')
  .option('--grace <minutes>', 'Grace period in minutes (default: 60)', '60')
  .action(async (options: { config?: string; grace?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);
      const gracePeriodMinutes = parseInt(options.grace ?? '60', 10);

      console.log(`Garbage collection (grace period: ${gracePeriodMinutes} мин)...`);

      try {
        const fileBlobStorage = new FileBlobStorage(sql);
        const chunkContentStorage = new ChunkContentStorage(sql);

        // Удаляем orphan chunk_contents (не ссылаются из chunks).
        const deletedContents = await chunkContentStorage.deleteOrphans(gracePeriodMinutes);
        console.log(`  Chunk contents: ${deletedContents} orphan удалено`);

        // Удаляем orphan file_blobs (не ссылаются из indexed_files).
        const deletedBlobs = await fileBlobStorage.deleteOrphans(gracePeriodMinutes);
        console.log(`  File blobs: ${deletedBlobs} orphan удалено`);

        const total = deletedContents + deletedBlobs;
        if (total === 0) {
          console.log('\nОрфанов не найдено.');
        } else {
          console.log(`\nИтого удалено: ${total} записей.`);
        }
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка команды rag gc: ${message}`);
      process.exit(1);
    }
  });
