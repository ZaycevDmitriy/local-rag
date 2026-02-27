// Точка входа MCP-сервера для поиска.
// MCP использует stdout для протокола — всё логирование через stderr.
import { loadConfig } from './config/index.js';
import { createDb, closeDb } from './storage/db.js';
import { startMcpServer } from './mcp/server.js';

// Парсинг аргумента --config из process.argv.
function parseConfigArg(): string | undefined {
  const idx = process.argv.indexOf('--config');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const configPath = parseConfigArg();
  const config = await loadConfig(configPath);
  const sql = createDb(config.database);

  // Корректное завершение при получении сигналов.
  const shutdown = async (): Promise<void> => {
    await closeDb(sql);
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  await startMcpServer(config, sql);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MCP server startup error: ${message}`);
  process.exit(1);
});
