// MCP-инструмент read_source — чтение фрагмента исходного файла.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChunkStorage } from '../../storage/chunks.js';
import type { SourceStorage } from '../../storage/sources.js';

// Регистрирует инструмент read_source на MCP-сервере.
export function registerReadSourceTool(
  server: McpServer,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
): void {
  server.registerTool(
    'read_source',
    {
      description: 'Read a fragment of source code or documentation by chunk ID or by file coordinates. ' +
        'Returns the file content around the specified location.',
      inputSchema: {
        chunkId: z.string().uuid().optional().describe('Chunk ID to read context for'),
        sourceName: z.string().optional().describe('Source name (used with path)'),
        path: z.string().optional().describe('Relative file path within the source'),
        startLine: z.number().int().min(1).optional().describe('Start line (1-based)'),
        endLine: z.number().int().min(1).optional().describe('End line (1-based, inclusive)'),
        context: z.number().int().min(0).max(50).optional().describe('Extra lines to include before and after (default: 0)'),
      },
    },
    async (args) => {
      try {
        if (args.chunkId) {
          return await readByChunkId(args.chunkId, args.context ?? 0, chunkStorage, sourceStorage);
        }

        if (args.sourceName && args.path) {
          return await readByCoordinates(
            args.sourceName,
            args.path,
            args.startLine,
            args.endLine,
            args.context ?? 0,
            sourceStorage,
          );
        }

        return {
          content: [{
            type: 'text' as const,
            text: 'Error: provide either chunkId or sourceName+path',
          }],
          isError: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error reading source: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

// Читает фрагмент файла по chunkId.
async function readByChunkId(
  chunkId: string,
  context: number,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const chunks = await chunkStorage.getByIds([chunkId]);
  if (chunks.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `Chunk ${chunkId} not found` }],
      isError: true,
    };
  }

  const chunk = chunks[0]!;
  const metadata = chunk.metadata as Record<string, unknown>;
  const sources = await sourceStorage.getAll();
  const source = sources.find((s) => s.id === chunk.source_id);

  if (!source?.path) {
    // Источник без пути (Git-клон и т.п.) — возвращаем содержимое чанка напрямую.
    return {
      content: [{
        type: 'text' as const,
        text: chunk.content,
      }],
    };
  }

  const path = metadata.path as string | undefined;
  const startLine = metadata.startLine as number | undefined;
  const endLine = metadata.endLine as number | undefined;

  if (!path) {
    return {
      content: [{ type: 'text' as const, text: chunk.content }],
    };
  }

  return await readFileFragment(
    source.path,
    path,
    startLine,
    endLine,
    context,
  );
}

// Читает фрагмент файла по имени источника и координатам.
async function readByCoordinates(
  sourceName: string,
  path: string,
  startLine: number | undefined,
  endLine: number | undefined,
  context: number,
  sourceStorage: SourceStorage,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const source = await sourceStorage.getByName(sourceName);
  if (!source) {
    return {
      content: [{ type: 'text' as const, text: `Source "${sourceName}" not found` }],
      isError: true,
    };
  }

  if (!source.path) {
    return {
      content: [{ type: 'text' as const, text: `Source "${sourceName}" has no local path` }],
      isError: true,
    };
  }

  return await readFileFragment(source.path, path, startLine, endLine, context);
}

// Читает фрагмент файла с учётом контекста.
async function readFileFragment(
  basePath: string,
  relativePath: string,
  startLine: number | undefined,
  endLine: number | undefined,
  context: number,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { join } = await import('node:path');
  const absolutePath = join(basePath, relativePath);

  let fileContent: string;
  try {
    fileContent = await readFile(absolutePath, 'utf-8');
  } catch {
    return {
      content: [{ type: 'text' as const, text: `Cannot read file: ${absolutePath}` }],
      isError: true,
    };
  }

  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  if (startLine === undefined && endLine === undefined) {
    // Возвращаем весь файл.
    return {
      content: [{
        type: 'text' as const,
        text: `// ${relativePath}\n${fileContent}`,
      }],
    };
  }

  // Применяем контекст и ограничиваем диапазон.
  const start = Math.max(1, (startLine ?? 1) - context);
  const end = Math.min(totalLines, (endLine ?? startLine ?? totalLines) + context);

  const fragment = lines.slice(start - 1, end).join('\n');

  return {
    content: [{
      type: 'text' as const,
      text: `// ${relativePath}:${start}-${end}\n${fragment}`,
    }],
  };
}
