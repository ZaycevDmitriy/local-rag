// MCP-инструмент search — гибридный семантический поиск.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchCoordinator } from '../../search/index.js';

// Регистрирует инструмент search на MCP-сервере.
export function registerSearchTool(server: McpServer, coordinator: SearchCoordinator): void {
  server.registerTool(
    'search',
    {
      description: 'Hybrid semantic search over indexed code and documentation. ' +
        'Combines BM25 full-text search with vector similarity and optional reranking.',
      inputSchema: {
        query: z.string().describe('Search query'),
        topK: z.number().int().min(1).max(100).optional().describe('Number of results to return (default: 10)'),
        sourceId: z.string().uuid().optional().describe('Filter by source ID'),
        sourceName: z.string().optional().describe('Filter by source name (alternative to sourceId — mutually exclusive)'),
        sourceType: z.enum(['code', 'markdown', 'text', 'pdf']).optional().describe('Filter by source type'),
        pathPrefix: z.string().optional().describe('Filter by file path prefix'),
        branch: z.string().optional().describe('Search in a specific branch instead of active views'),
      },
    },
    async (args) => {
      try {
        const response = await coordinator.search({
          query: args.query,
          topK: args.topK,
          sourceId: args.sourceId,
          sourceName: args.sourceName,
          sourceType: args.sourceType,
          pathPrefix: args.pathPrefix,
          branch: args.branch,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Search error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
