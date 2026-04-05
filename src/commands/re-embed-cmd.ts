// Команда rag re-embed — перегенерация эмбеддингов через chunk_contents.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, SourceStorage, ChunkContentStorage } from '../storage/index.js';
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
        const chunkContentStorage = new ChunkContentStorage(sql);
        const embedder = createTextEmbedder(config.embeddings);

        // Определяем sourceId (для фильтрации).
        let sourceId: string | undefined;
        if (options.source) {
          const source = await sourceStorage.getByName(options.source);
          if (!source) {
            console.error(`Источник "${options.source}" не найден.`);
            process.exit(1);
          }
          sourceId = source.id;
          console.log(`Фильтрация по источнику: ${options.source} (${sourceId})`);
        }

        const force = !!options.force;

        // Для --source фильтрация через chunk_contents не поддерживается напрямую
        // (content deduplicated). Без --source обрабатываем все NULL embedding.
        if (sourceId && !force) {
          console.log('WARN: --source фильтрация с chunk_contents работает по всем content rows с NULL embedding.');
        }

        // Подсчёт chunk_contents без embedding.
        const sample = await chunkContentStorage.getWithNullEmbedding(1);
        if (sample.length === 0 && !force) {
          console.log('Нет фрагментов для перегенерации эмбеддингов.');
          return;
        }

        console.log('Перегенерация эмбеддингов chunk_contents...');

        let processed = 0;
        let hasMore = true;

        while (hasMore) {
          const contents = await chunkContentStorage.getWithNullEmbedding(BATCH_SIZE);

          if (contents.length === 0) {
            hasMore = false;
            break;
          }

          // Генерация эмбеддингов.
          const texts = contents.map((c) => c.content);
          const embeddings = await embedder.embedBatch(texts);

          // Обновление через batch.
          const updates = contents.map((c, i) => ({
            contentHash: c.content_hash,
            embedding: embeddings[i]!,
          }));
          await chunkContentStorage.updateEmbeddings(updates);

          processed += contents.length;
          process.stdout.write(`\rОбработано: ${processed} content rows`);
        }

        console.log(`\n\nПерегенерация завершена: ${processed} content rows обработано.`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка команды rag re-embed${options.source ? ` для источника "${options.source}"` : ''}: ${message}`);
      process.exit(1);
    }
  });
