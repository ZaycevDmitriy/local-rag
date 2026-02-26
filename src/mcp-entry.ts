// Точка входа MCP-сервера для поиска.
// MCP использует stdout для протокола — всё логирование через stderr.
import { loadConfig } from './config/index.js';
import { createDb, closeDb } from './storage/db.js';
import { startMcpServer } from './mcp/server.js';

async function main(): Promise<void> {
  const config = await loadConfig();
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
