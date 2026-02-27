// MCP-инструмент status — состояние системы local-rag.
import type postgres from 'postgres';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../../config/schema.js';
import { isTreeSitterSupported } from '../../chunks/code/languages.js';
import { getAppliedMigrations } from '../../storage/index.js';

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
        const [sourcesResult, chunksResult, lastIndexedResult, appliedMigrations] = await Promise.all([
          sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM sources`,
          sql<Array<{ count: string }>>`SELECT COUNT(*)::text AS count FROM chunks`,
          sql<Array<{ last_indexed_at: Date | null }>>`
            SELECT MAX(last_indexed_at) AS last_indexed_at FROM sources
          `,
          getAppliedMigrations(sql),
        ]);

        const sourceCount = parseInt(sourcesResult[0]!.count, 10);
        const chunkCount = parseInt(chunksResult[0]!.count, 10);
        const lastIndexedAt = lastIndexedResult[0]?.last_indexed_at;
        const schemaVersion = appliedMigrations.at(-1) ?? null;

        const status = {
          database: {
            connected: true,
            schemaVersion,
            totalSources: sourceCount,
            totalChunks: chunkCount,
          },
          providers: {
            embeddings: {
              provider: config.embeddings.provider,
              configured: true,
            },
            reranker: {
              provider: config.reranker.provider,
              configured: true,
            },
          },
          indexing: {
            active: false,
            lastIndexedAt: lastIndexedAt?.toISOString() ?? null,
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
