// MCP-инструмент list_sources — список источников с view metadata.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceStorage, SourceViewStorage } from '../../storage/index.js';

// Регистрирует инструмент list_sources на MCP-сервере.
export function registerListSourcesTool(
  server: McpServer,
  sourceStorage: SourceStorage,
  sourceViewStorage: SourceViewStorage,
): void {
  server.registerTool(
    'list_sources',
    {
      description: 'List all indexed sources with their metadata (name, type, path, chunk count, last indexed time).',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of sources to return'),
        sourceType: z.string().optional().describe('Filter by source type (local/git)'),
        pathPrefix: z.string().optional().describe('Filter by path prefix'),
      },
    },
    async (args) => {
      try {
        const sources = await sourceStorage.getAll();

        // Фильтрация по типу и префиксу пути.
        const filtered = sources.filter((s) => {
          if (args.sourceType && s.type !== args.sourceType) return false;
          if (args.pathPrefix && !s.path?.startsWith(args.pathPrefix)) return false;
          return true;
        });

        const limited = args.limit ? filtered.slice(0, args.limit) : filtered;

        // Загружаем views для каждого source.
        const result = await Promise.all(
          limited.map(async (s) => {
            const views = await sourceViewStorage.listBySource(s.id);
            const activeView = views.find((v) => v.id === s.active_view_id);

            return {
              id: s.id,
              name: s.name,
              type: s.type,
              path: s.path,
              lastIndexedAt: s.last_indexed_at?.toISOString() ?? null,
              activeView: activeView
                ? {
                  viewKind: activeView.view_kind,
                  refName: activeView.ref_name,
                  chunkCount: activeView.chunk_count,
                  fileCount: activeView.file_count,
                  dirty: activeView.dirty,
                  snapshotFingerprint: activeView.snapshot_fingerprint,
                }
                : null,
              viewCount: views.length,
            };
          }),
        );

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
