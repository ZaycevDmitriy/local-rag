// Команда rag init — инициализация базы данных.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { resolveEmbeddingDimensions } from '../embeddings/index.js';
import {
  createDb,
  closeDb,
  runMigrations,
  getAppliedMigrations,
  initialMigration,
  createVectorDimensionsMigration,
  pathIndexMigration,
  metadataIndexesMigration,
  createBranchViewsRebuildMigration,
  createSummarizationMigration,
} from '../storage/index.js';
import type { Migration } from '../storage/index.js';

export const initCommand = new Command('init')
  .description('Initialize database (run migrations)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        console.log('Инициализация базы данных...');

        // Определяем размерность вектора из активного провайдера (config.embeddings.provider).
        // Критично для siliconflow с кастомной dimensions (например, Qwen3-Embedding-8B=4096):
        // прежний резолв по факту наличия jina/openai под-объектов создавал vector(1024),
        // а embedder возвращал 4096 → INSERT падал на обоих каналах (embedding + summary_embedding).
        const dimensions = resolveEmbeddingDimensions(config.embeddings);
        console.log(
          `[FIX] Провайдер эмбеддингов: ${config.embeddings.provider}, dimensions: ${dimensions}`,
        );

        // Проверяем, требуется ли деструктивная миграция 005 при наличии данных.
        const applied = await getAppliedMigrations(sql);
        const has005 = applied.includes('005_branch_views_rebuild');
        const hasExistingData = applied.length > 0 && !has005;

        if (hasExistingData) {
          console.warn(
            '\n⚠  Миграция 005_branch_views_rebuild пересоздаст все таблицы (DROP + CREATE).\n' +
            '   Существующие данные будут потеряны. Рекомендуется сначала выполнить:\n' +
            '   rag export --all\n',
          );
        }

        const migrations: Migration[] = [initialMigration];
        if (dimensions !== 1024) {
          migrations.push(createVectorDimensionsMigration(dimensions));
        }
        migrations.push(pathIndexMigration);
        migrations.push(metadataIndexesMigration);
        migrations.push(createBranchViewsRebuildMigration(dimensions));
        migrations.push(createSummarizationMigration(dimensions));

        await runMigrations(sql, migrations);
        console.log('База данных успешно инициализирована.');
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка инициализации: ${message}`);
      process.exit(1);
    }
  });
