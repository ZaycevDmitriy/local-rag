// Команда rag init — инициализация базы данных.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, runMigrations, initialMigration } from '../storage/index.js';

export const initCommand = new Command('init')
  .description('Initialize database (run migrations)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        console.log('Инициализация базы данных...');
        await runMigrations(sql, [initialMigration]);
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
