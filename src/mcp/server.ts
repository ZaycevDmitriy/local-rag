// MCP stdio-сервер local-rag: search, read_source, list_sources, status.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type postgres from 'postgres';
import type { AppConfig } from '../config/index.js';
import { createTextEmbedder } from '../embeddings/index.js';
import { createReranker, SearchCoordinator } from '../search/index.js';
import {
  ChunkStorage,
  ChunkContentStorage,
  FileBlobStorage,
  IndexedFileStorage,
  SourceStorage,
  SourceViewStorage,
} from '../storage/index.js';
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

  // Инициализируем зависимости (branch-aware DI).
  const chunkStorage = new ChunkStorage(sql);
  const chunkContentStorage = new ChunkContentStorage(sql);
  const fileBlobStorage = new FileBlobStorage(sql);
  const indexedFileStorage = new IndexedFileStorage(sql);
  const sourceStorage = new SourceStorage(sql);
  const sourceViewStorage = new SourceViewStorage(sql);
  const embedder = createTextEmbedder(config.embeddings);
  const reranker = createReranker(config.reranker);

  const coordinator = new SearchCoordinator(
    chunkStorage,
    sourceStorage,
    embedder,
    config.search,
    reranker,
    chunkContentStorage,
    sourceViewStorage,
  );

  // Регистрируем инструменты.
  registerSearchTool(server, coordinator);
  registerReadSourceTool(server, chunkStorage, sourceStorage, fileBlobStorage, indexedFileStorage);
  registerListSourcesTool(server, sourceStorage, sourceViewStorage);
  registerStatusTool(server, sql, config);

  // Подключаем stdio transport.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('local-rag MCP server started');
}
