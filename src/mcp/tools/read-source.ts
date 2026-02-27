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
        headerPath: z.string().optional().describe('Header path within the file (for markdown sections)'),
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

        if (args.sourceName && args.path && args.headerPath) {
          return await readByHeaderPath(
            args.sourceName,
            args.path,
            args.headerPath,
            chunkStorage,
            sourceStorage,
          );
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
        text: JSON.stringify({
          content: chunk.content,
          path: metadata.path ?? null,
          sourceType: metadata.sourceType ?? 'text',
          metadata: {
            startLine: metadata.startLine,
            endLine: metadata.endLine,
            fqn: metadata.fqn,
            fragmentType: metadata.fragmentType,
            headerPath: metadata.headerPath,
            language: metadata.language,
          },
        }, null, 2),
      }],
    };
  }

  const path = metadata.path as string | undefined;
  const startLine = metadata.startLine as number | undefined;
  const endLine = metadata.endLine as number | undefined;

  if (!path) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          content: chunk.content,
          path: null,
          sourceType: metadata.sourceType ?? 'text',
          metadata: {},
        }, null, 2),
      }],
    };
  }

  return await readFileFragment(
    source.path,
    path,
    startLine,
    endLine,
    context,
    metadata,
  );
}

// Читает фрагмент файла по headerPath.
async function readByHeaderPath(
  sourceName: string,
  path: string,
  headerPath: string,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const source = await sourceStorage.getByName(sourceName);
  if (!source) {
    return {
      content: [{ type: 'text' as const, text: `Source "${sourceName}" not found` }],
      isError: true,
    };
  }

  const chunk = await chunkStorage.findByHeaderPath(source.id, path, headerPath);
  if (!chunk) {
    return {
      content: [{ type: 'text' as const, text: `No chunk found for headerPath "${headerPath}" in ${path}` }],
      isError: true,
    };
  }

  const metadata = chunk.metadata as Record<string, unknown>;

  if (!source.path) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          content: chunk.content,
          path,
          sourceType: metadata.sourceType ?? 'text',
          metadata: {
            startLine: metadata.startLine,
            endLine: metadata.endLine,
            headerPath: metadata.headerPath,
          },
        }, null, 2),
      }],
    };
  }

  return await readFileFragment(
    source.path,
    path,
    metadata.startLine as number | undefined,
    metadata.endLine as number | undefined,
    0,
    metadata,
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

  return await readFileFragment(source.path, path, startLine, endLine, context, {});
}

// Читает фрагмент файла с учётом контекста. Возвращает структурированный ответ.
async function readFileFragment(
  basePath: string,
  relativePath: string,
  startLine: number | undefined,
  endLine: number | undefined,
  context: number,
  metadata: Record<string, unknown>,
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

  let fragmentContent: string;
  let actualStart: number | undefined;
  let actualEnd: number | undefined;

  if (startLine === undefined && endLine === undefined) {
    // Возвращаем весь файл.
    fragmentContent = fileContent;
  } else {
    // Применяем контекст и ограничиваем диапазон.
    actualStart = Math.max(1, (startLine ?? 1) - context);
    actualEnd = Math.min(totalLines, (endLine ?? startLine ?? totalLines) + context);
    fragmentContent = lines.slice(actualStart - 1, actualEnd).join('\n');
  }

  const result = {
    content: fragmentContent,
    path: relativePath,
    sourceType: (metadata.sourceType as string | undefined) ?? 'text',
    metadata: {
      startLine: actualStart,
      endLine: actualEnd,
      fqn: metadata.fqn as string | undefined,
      fragmentType: metadata.fragmentType as string | undefined,
      headerPath: metadata.headerPath as string | undefined,
      language: metadata.language as string | undefined,
    },
  };

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}
