// Команда rag status — статус системы.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { closeDb, createDb } from '../storage/index.js';
import { getSystemStatusSnapshot } from '../status/index.js';

export const statusCommand = new Command('status')
  .description('Show system status')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const snapshot = await getSystemStatusSnapshot(sql, config);

        console.log('');
        console.log('=== Статус Local RAG ===');
        console.log('');
        console.log(`Источники:     ${snapshot.sourceCount}`);
        console.log(`Фрагменты:     ${snapshot.chunkCount}`);
        console.log(
          `Последняя индексация: ${snapshot.lastIndexedAt ? new Date(snapshot.lastIndexedAt).toLocaleString('ru-RU') : 'не выполнялась'}`,
        );
        console.log('');
        console.log(`Провайдер эмбеддингов: ${snapshot.embeddingsProvider}`);
        console.log(`Провайдер реранкера:   ${snapshot.rerankerProvider}`);
        console.log('');
        console.log(`Миграции: ${snapshot.appliedMigrations.length > 0 ? snapshot.appliedMigrations.join(', ') : 'не применены'}`);
        console.log('');
        console.log('Tree-sitter languages:');
        console.log('  TypeScript/TSX:  active');
        console.log('  JavaScript/JSX:  active');
        console.log(`  Java:            ${snapshot.treeSitterLanguages.java}`);
        console.log(`  Kotlin:          ${snapshot.treeSitterLanguages.kotlin}`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка команды rag status: ${message}`);
      process.exit(1);
    }
  });
