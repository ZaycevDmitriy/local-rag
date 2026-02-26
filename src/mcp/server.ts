// MCP stdio-сервер local-rag: search, read_source, list_sources, status.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type postgres from 'postgres';
import type { AppConfig } from '../config/schema.js';
import { ChunkStorage } from '../storage/chunks.js';
import { SourceStorage } from '../storage/sources.js';
import { createTextEmbedder } from '../embeddings/factory.js';
import { createReranker } from '../search/reranker/factory.js';
import { SearchCoordinator } from '../search/coordinator.js';
import { registerSearchTool } from './tools/search.js';
import { registerReadSourceTool } from './tools/read-source.js';
import { registerListSourcesTool } from './tools/list-sources.js';
import { registerStatusTool } from './tools/status.js';

// Запускает MCP stdio-сервер и регистрирует все 4 инструмента.
export async function startMcpServer(config: AppConfig, sql: postgres.Sql): Promise<void> {
  const server = new McpServer({
    name: 'local-rag',
    version: '0.1.0',
  });

  // Инициализируем зависимости.
  const chunkStorage = new ChunkStorage(sql);
  const sourceStorage = new SourceStorage(sql);
  const embedder = createTextEmbedder(config.embeddings);
  const reranker = createReranker(config.reranker);

  const coordinator = new SearchCoordinator(
    chunkStorage,
    sourceStorage,
    embedder,
    config.search,
    reranker,
  );

  // Регистрируем инструменты.
  registerSearchTool(server, coordinator);
  registerReadSourceTool(server, chunkStorage, sourceStorage);
  registerListSourcesTool(server, sourceStorage);
  registerStatusTool(server, sql, config);

  // Подключаем stdio transport.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('local-rag MCP server started');
}
