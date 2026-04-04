import { describe, it, expect, vi, beforeEach } from 'vitest';
import type postgres from 'postgres';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppConfigSchema } from '../../../config/index.js';

vi.mock('../../../status/index.js', () => ({
  getSystemStatusSnapshot: vi.fn(),
}));

import { getSystemStatusSnapshot } from '../../../status/index.js';
import { registerStatusTool } from '../status.js';

function createConfig() {
  return AppConfigSchema.parse({
    embeddings: {
      provider: 'jina',
      jina: {
        apiKey: 'jina-key',
      },
    },
  });
}

function createServerMock() {
  let handler: (() => Promise<unknown>) | undefined;
  let name: string | undefined;
  let inputSchema: unknown;

  const server = {
    registerTool: vi.fn(
      (
        toolName: string,
        meta: { inputSchema: unknown },
        toolHandler: () => Promise<unknown>,
      ) => {
        name = toolName;
        inputSchema = meta.inputSchema;
        handler = toolHandler;
      },
    ),
  };

  return {
    server: server as unknown as McpServer,
    getRegistered: () => ({ name, inputSchema, handler }),
  };
}

describe('registerStatusTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('регистрирует status tool и сериализует snapshot в MCP-ответ', async () => {
    const snapshot = {
      sourceCount: 3,
      chunkCount: 42,
      lastIndexedAt: '2026-03-26T12:34:56.000Z',
      appliedMigrations: ['001_initial', '002_vector_dimensions'],
      embeddingsProvider: 'jina',
      rerankerProvider: 'none',
      search: {
        bm25Weight: 0.4,
        vectorWeight: 0.6,
        retrieveTopK: 50,
        finalTopK: 10,
      },
      treeSitterLanguages: {
        typescript: 'active' as const,
        javascript: 'active' as const,
        java: 'active' as const,
        kotlin: 'fallback' as const,
      },
      viewCount: 5,
      fileBlobCount: 100,
      fileBlobSizeBytes: 512000,
      chunkContentCount: 200,
      chunkContentWithEmbeddingCount: 180,
    };

    vi.mocked(getSystemStatusSnapshot).mockResolvedValue(snapshot);

    const sql = {} as postgres.Sql;
    const config = createConfig();
    const { server, getRegistered } = createServerMock();

    registerStatusTool(server, sql, config);

    const registered = getRegistered();

    expect(registered.name).toBe('status');
    expect(registered.inputSchema).toEqual({});

    const response = await registered.handler?.();

    expect(getSystemStatusSnapshot).toHaveBeenCalledWith(sql, config);
    expect(response).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          database: {
            connected: true,
            schemaVersion: '002_vector_dimensions',
            totalSources: 3,
            totalViews: 5,
            totalChunks: 42,
          },
          storage: {
            fileBlobCount: 100,
            fileBlobSizeBytes: 512000,
            chunkContentCount: 200,
            chunkContentWithEmbeddingCount: 180,
          },
          providers: {
            embeddings: {
              provider: 'jina',
              configured: true,
            },
            reranker: {
              provider: 'none',
              configured: true,
            },
          },
          indexing: {
            active: false,
            lastIndexedAt: '2026-03-26T12:34:56.000Z',
          },
          search: snapshot.search,
          treeSitterLanguages: snapshot.treeSitterLanguages,
        }, null, 2),
      }],
    });
  });

  it('возвращает isError=true, если snapshot собрать не удалось', async () => {
    vi.mocked(getSystemStatusSnapshot).mockRejectedValue(new Error('db unavailable'));

    const { server, getRegistered } = createServerMock();

    registerStatusTool(server, {} as postgres.Sql, createConfig());

    const response = await getRegistered().handler?.();

    expect(response).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          database: {
            connected: false,
            error: 'db unavailable',
          },
        }, null, 2),
      }],
      isError: true,
    });
  });
});
