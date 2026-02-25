// Модуль подключения к PostgreSQL.
import postgres from 'postgres';
import type { DatabaseConfig } from '../config/schema.js';

// Создает подключение к PostgreSQL по конфигурации.
export function createDb(config: DatabaseConfig): postgres.Sql {
  return postgres({
    host: config.host,
    port: config.port,
    database: config.name,
    username: config.user,
    password: config.password,
    onnotice: () => { /* Подавляем NOTICE от PostgreSQL (например CREATE IF NOT EXISTS). */ },
  });
}

// Закрывает подключение к PostgreSQL.
export async function closeDb(sql: postgres.Sql): Promise<void> {
  await sql.end();
}
