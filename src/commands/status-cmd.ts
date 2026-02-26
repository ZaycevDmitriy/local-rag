// Команда rag status — статус системы.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, getAppliedMigrations } from '../storage/index.js';

export const statusCommand = new Command('status')
  .description('Show system status')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        // Статистика источников и фрагментов.
        const [sourcesResult] = await sql<[{ count: string }]>`
          SELECT COUNT(*)::text AS count FROM sources
        `;
        const [chunksResult] = await sql<[{ count: string }]>`
          SELECT COUNT(*)::text AS count FROM chunks
        `;
        const [lastIndexedResult] = await sql<[{ last: Date | null }]>`
          SELECT MAX(last_indexed_at) AS last FROM sources
        `;

        // Версия схемы (применённые миграции).
        const migrations = await getAppliedMigrations(sql);

        const sourceCount = parseInt(sourcesResult!.count, 10);
        const chunkCount = parseInt(chunksResult!.count, 10);
        const lastIndexed = lastIndexedResult!.last;

        console.log('');
        console.log('=== Статус Local RAG ===');
        console.log('');
        console.log(`Источники:     ${sourceCount}`);
        console.log(`Фрагменты:     ${chunkCount}`);
        console.log(
          `Последняя индексация: ${lastIndexed ? new Date(lastIndexed).toLocaleString('ru-RU') : 'не выполнялась'}`,
        );
        console.log('');
        console.log(`Провайдер эмбеддингов: ${config.embeddings.provider}`);
        console.log(`Провайдер реранкера:   ${config.reranker.provider}`);
        console.log('');
        console.log(`Миграции: ${migrations.length > 0 ? migrations.join(', ') : 'не применены'}`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка: ${message}`);
      process.exit(1);
    }
  });
