// MCP-инструмент status — состояние системы local-rag.
import type postgres from 'postgres';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../../config/schema.js';
import { isTreeSitterSupported } from '../../chunks/code/languages.js';

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
        // Проверяем подключение к БД и получаем статистику.
        const [sourcesResult, chunksResult] = await Promise.all([
          sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM sources`,
          sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM chunks`,
        ]);

        const sourceCount = parseInt(sourcesResult[0]!.count, 10);
        const chunkCount = parseInt(chunksResult[0]!.count, 10);

        const status = {
          database: {
            connected: true,
            host: config.database.host,
            port: config.database.port,
            name: config.database.name,
          },
          stats: {
            sources: sourceCount,
            chunks: chunkCount,
          },
          providers: {
            embeddings: config.embeddings.provider,
            reranker: config.reranker.provider,
          },
          search: {
            bm25Weight: config.search.bm25Weight,
            vectorWeight: config.search.vectorWeight,
            finalTopK: config.search.finalTopK,
            retrieveTopK: config.search.retrieveTopK,
          },
          treeSitterLanguages: {
            typescript: 'active',
            javascript: 'active',
            java: isTreeSitterSupported('Test.java') ? 'active' : 'fallback',
            kotlin: isTreeSitterSupported('Test.kt') ? 'active' : 'fallback',
          },
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
