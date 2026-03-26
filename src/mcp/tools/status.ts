// MCP-инструмент status — состояние системы local-rag.
import type postgres from 'postgres';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../../config/index.js';
import { getSystemStatusSnapshot } from '../../status/index.js';

// Регистрирует инструмент status на MCP-сервере.
export function registerStatusTool(
  server: McpServer,
  sql: postgres.Sql,
  config: AppConfig,
): void {
  server.registerTool(
    'status',
    {
      description: 'Get the current status of the local-rag system: database connectivity, ' +
        'source counts, chunk counts, and configuration overview.',
      inputSchema: {},
    },
    async () => {
      try {
        const snapshot = await getSystemStatusSnapshot(sql, config);
        const schemaVersion = snapshot.appliedMigrations.at(-1) ?? null;

        const status = {
          database: {
            connected: true,
            schemaVersion,
            totalSources: snapshot.sourceCount,
            totalChunks: snapshot.chunkCount,
          },
          providers: {
            embeddings: {
              provider: snapshot.embeddingsProvider,
              configured: true,
            },
            reranker: {
              provider: snapshot.rerankerProvider,
              configured: true,
            },
          },
          indexing: {
            active: false,
            lastIndexedAt: snapshot.lastIndexedAt,
          },
          search: snapshot.search,
          treeSitterLanguages: snapshot.treeSitterLanguages,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(status, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              database: { connected: false, error: message },
            }, null, 2),
          }],
          isError: true,
        };
      }
    },
  );
}
