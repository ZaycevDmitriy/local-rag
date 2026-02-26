// MCP-инструмент list_sources — список проиндексированных источников.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceStorage } from '../../storage/sources.js';

// Регистрирует инструмент list_sources на MCP-сервере.
export function registerListSourcesTool(server: McpServer, sourceStorage: SourceStorage): void {
  server.registerTool(
    'list_sources',
    {
      description: 'List all indexed sources with their metadata (name, type, path, chunk count, last indexed time).',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of sources to return'),
      },
    },
    async (args) => {
      try {
        const sources = await sourceStorage.getAll();
        const limited = args.limit ? sources.slice(0, args.limit) : sources;

        const result = limited.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          path: s.path,
          chunkCount: s.chunk_count,
          lastIndexedAt: s.last_indexed_at?.toISOString() ?? null,
          createdAt: s.created_at.toISOString(),
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing sources: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
