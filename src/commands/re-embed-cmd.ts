// Команда rag re-embed — перегенерация эмбеддингов.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, SourceStorage, ChunkStorage } from '../storage/index.js';
import { createTextEmbedder } from '../embeddings/index.js';

// Размер батча для эмбеддингов (как в Indexer).
const BATCH_SIZE = 64;

export const reEmbedCommand = new Command('re-embed')
  .description('Generate embeddings for chunks with missing vectors')
  .option('--source <name>', 'Only re-embed specific source')
  .option('--force', 'Re-embed all chunks (including existing)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: {
    source?: string;
    force?: boolean;
    config?: string;
  }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const sourceStorage = new SourceStorage(sql);
        const chunkStorage = new ChunkStorage(sql);
        const embedder = createTextEmbedder(config.embeddings);

        // Определяем sourceId.
        let sourceId: string | undefined;
        if (options.source) {
          const source = await sourceStorage.getByName(options.source);
          if (!source) {
            console.error(`Источник "${options.source}" не найден.`);
            process.exit(1);
          }
          sourceId = source.id;
        }

        const force = !!options.force;

        // Подсчёт чанков.
        const total = await chunkStorage.countForReEmbed(sourceId, force);

        if (total === 0) {
          console.log('Нет фрагментов для перегенерации эмбеддингов.');
          return;
        }

        console.log(`Перегенерация эмбеддингов: ${total} фрагментов...`);

        let processed = 0;
        // При force=false после обновления чанки уходят из NULL-набора → всегда offset=0.
        // При force=true — offset инкрементируем нормально.
        const useIncreasingOffset = force;
        let offset = 0;

        while (processed < total) {
          const chunks = await chunkStorage.getChunksForReEmbed({
            sourceId,
            force,
            limit: BATCH_SIZE,
            offset: useIncreasingOffset ? offset : 0,
          });

          if (chunks.length === 0) break;

          // Генерация эмбеддингов.
          const contents = chunks.map((c) => c.content);
          const embeddings = await embedder.embedBatch(contents);

          // Обновление.
          for (let i = 0; i < chunks.length; i++) {
            await chunkStorage.updateEmbedding(chunks[i]!.id, embeddings[i]!);
          }

          processed += chunks.length;
          offset += BATCH_SIZE;
          process.stdout.write(`\rОбработано: ${processed}/${total} фрагментов`);
        }

        console.log(`\n\nПерегенерация завершена: ${processed} фрагментов обработано.`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка: ${message}`);
      process.exit(1);
    }
  });
