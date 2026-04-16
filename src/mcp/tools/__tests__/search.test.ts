import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchCoordinator } from '../../../search/index.js';
import type { SearchQuery, SearchResponse } from '../../../search/types.js';
import { registerSearchTool } from '../search.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function createServerMock() {
  let handler: Handler | undefined;
  let name: string | undefined;
  let inputSchema: Record<string, unknown> | undefined;

  const server = {
    registerTool: vi.fn(
      (
        toolName: string,
        meta: { inputSchema: Record<string, unknown> },
        toolHandler: Handler,
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

function emptyResponse(): SearchResponse {
  return { results: [], totalCandidates: 0, retrievalMode: 'empty' };
}

describe('registerSearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('регистрирует tool search с inputSchema, включающим sourceName', () => {
    const coordinator = {
      search: vi.fn().mockResolvedValue(emptyResponse()),
    } as unknown as SearchCoordinator;

    const { server, getRegistered } = createServerMock();

    registerSearchTool(server, coordinator);

    const { name, inputSchema } = getRegistered();

    expect(name).toBe('search');
    expect(inputSchema).toBeDefined();
    expect(Object.keys(inputSchema!)).toContain('sourceName');
    expect(Object.keys(inputSchema!)).toContain('sourceId');
  });

  it('пробрасывает sourceName в coordinator.search', async () => {
    const searchSpy = vi.fn().mockResolvedValue(emptyResponse());
    const coordinator = { search: searchSpy } as unknown as SearchCoordinator;

    const { server, getRegistered } = createServerMock();
    registerSearchTool(server, coordinator);

    const { handler } = getRegistered();
    await handler!({ query: 'hello', sourceName: 'karipos' });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const passed = searchSpy.mock.calls[0]![0] as SearchQuery;
    expect(passed.sourceName).toBe('karipos');
    expect(passed.sourceId).toBeUndefined();
  });

  it('возвращает isError: true при Error("Source ... not found") из coordinator', async () => {
    const coordinator = {
      search: vi.fn().mockRejectedValue(new Error('Source "no-such" not found')),
    } as unknown as SearchCoordinator;

    const { server, getRegistered } = createServerMock();
    registerSearchTool(server, coordinator);

    const response = (await getRegistered().handler!({
      query: 'hello',
      sourceName: 'no-such',
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(response.isError).toBe(true);
    expect(response.content[0]!.text).toContain('no-such');
    expect(response.content[0]!.text).toContain('not found');
  });

  it('возвращает isError: true при конфликте sourceId+sourceName', async () => {
    const coordinator = {
      search: vi.fn().mockRejectedValue(
        new Error('Provide either sourceId or sourceName, not both'),
      ),
    } as unknown as SearchCoordinator;

    const { server, getRegistered } = createServerMock();
    registerSearchTool(server, coordinator);

    const response = (await getRegistered().handler!({
      query: 'hello',
      sourceId: '00000000-0000-0000-0000-000000000000',
      sourceName: 'karipos',
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(response.isError).toBe(true);
    expect(response.content[0]!.text).toContain('not both');
  });

  it('возвращает сериализованный response при успехе (без isError)', async () => {
    const response: SearchResponse = {
      results: [
        {
          chunkId: 'c1',
          path: 'src/a.ts',
          sourceType: 'code',
          sourceName: 'karipos',
          snippet: 'hello',
          coordinates: {},
          scores: { bm25: 0.5, vector: 0.6, rrf: 0.1, rerank: 0.9 },
        },
      ],
      totalCandidates: 1,
      retrievalMode: 'narrow',
    };

    const coordinator = {
      search: vi.fn().mockResolvedValue(response),
    } as unknown as SearchCoordinator;

    const { server, getRegistered } = createServerMock();
    registerSearchTool(server, coordinator);

    const result = (await getRegistered().handler!({
      query: 'hello',
      sourceName: 'karipos',
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.results[0].sourceName).toBe('karipos');
    expect(parsed.retrievalMode).toBe('narrow');
  });
});
