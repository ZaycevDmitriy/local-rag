// MCP-инструмент read_source — чтение через blob-backed snapshot или FS fallback.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ChunkStorage,
  FileBlobStorage,
  IndexedFileStorage,
  SourceStorage,
} from '../../storage/index.js';

// Регистрирует инструмент read_source на MCP-сервере.
export function registerReadSourceTool(
  server: McpServer,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
  fileBlobStorage: FileBlobStorage,
  indexedFileStorage: IndexedFileStorage,
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
        branch: z.string().optional().describe('Read from a specific branch view instead of active view'),
      },
    },
    async (args) => {
      try {
        if (args.chunkId) {
          return await readByChunkId(
            args.chunkId, args.context ?? 0,
            chunkStorage, sourceStorage, fileBlobStorage, indexedFileStorage,
          );
        }

        if (args.sourceName && args.path && args.headerPath) {
          return await readByHeaderPath(
            args.sourceName, args.path, args.headerPath,
            chunkStorage, sourceStorage, fileBlobStorage, indexedFileStorage,
          );
        }

        if (args.sourceName && args.path) {
          return await readByCoordinates(
            args.sourceName, args.path, args.startLine, args.endLine, args.context ?? 0,
            sourceStorage, fileBlobStorage, indexedFileStorage, args.branch,
          );
        }

        return {
          content: [{ type: 'text' as const, text: 'Error: provide either chunkId or sourceName+path' }],
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

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

// --- Blob-backed чтение. ---

/**
 * Загружает содержимое файла через file_blobs.
 * Fallback на FS если blob не найден.
 */
async function loadFileContent(
  contentHash: string | null,
  basePath: string | null,
  relativePath: string,
  fileBlobStorage: FileBlobStorage,
): Promise<string | null> {
  // Попытка из blob.
  if (contentHash) {
    const blob = await fileBlobStorage.getByHash(contentHash);
    if (blob) {
      console.log(`[read_source] blob-backed read: hash=${contentHash.slice(0, 12)}`);
      return blob.content;
    }
  }

  // FS fallback.
  if (basePath) {
    try {
      const absolutePath = join(basePath, relativePath);
      console.log(`[read_source] FS fallback: ${absolutePath}`);
      return await readFile(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Получает content_hash из indexed_files для чанка.
 */
async function getFileContentHash(
  _indexedFileId: string,
  viewId: string,
  path: string,
  indexedFileStorage: IndexedFileStorage,
): Promise<string | null> {
  // Ищем indexed_file по view + path.
  const indexedFile = await indexedFileStorage.getByPath(viewId, path);
  if (indexedFile) {
    return indexedFile.content_hash;
  }
  return null;
}

// --- Resolution paths. ---

async function readByChunkId(
  chunkId: string,
  context: number,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
  fileBlobStorage: FileBlobStorage,
  indexedFileStorage: IndexedFileStorage,
): Promise<ToolResult> {
  console.log(`[read_source] mode=chunkId, id=${chunkId}`);

  const chunks = await chunkStorage.getByIds([chunkId]);
  if (chunks.length === 0) {
    return { content: [{ type: 'text', text: `Chunk ${chunkId} not found` }], isError: true };
  }

  const chunk = chunks[0]!;
  const source = await sourceStorage.getById(chunk.source_id);

  // Blob-backed чтение.
  const contentHash = await getFileContentHash(
    chunk.indexed_file_id, chunk.source_view_id, chunk.path, indexedFileStorage,
  );
  const fileContent = await loadFileContent(contentHash, source?.path ?? null, chunk.path, fileBlobStorage);

  if (fileContent) {
    return formatFileFragment(fileContent, chunk.path, chunk.start_line ?? undefined, chunk.end_line ?? undefined, context, {
      sourceType: chunk.source_type,
      language: chunk.language,
      headerPath: chunk.header_path,
    });
  }

  // Fallback: возвращаем содержимое чанка.
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        content: chunk.content,
        path: chunk.path,
        sourceType: chunk.source_type,
        metadata: {
          startLine: chunk.start_line,
          endLine: chunk.end_line,
          headerPath: chunk.header_path,
          language: chunk.language,
        },
      }, null, 2),
    }],
  };
}

async function readByHeaderPath(
  sourceName: string,
  path: string,
  headerPath: string,
  chunkStorage: ChunkStorage,
  sourceStorage: SourceStorage,
  fileBlobStorage: FileBlobStorage,
  indexedFileStorage: IndexedFileStorage,
): Promise<ToolResult> {
  console.log(`[read_source] mode=headerPath, source=${sourceName}, path=${path}, header=${headerPath}`);

  const source = await sourceStorage.getByName(sourceName);
  if (!source) {
    return { content: [{ type: 'text', text: `Source "${sourceName}" not found` }], isError: true };
  }

  // Для headerPath нужен viewId. Используем active view.
  const viewId = source.active_view_id;
  if (!viewId) {
    return { content: [{ type: 'text', text: `Source "${sourceName}" has no active view` }], isError: true };
  }

  const chunk = await chunkStorage.findByHeaderPath(viewId, path, headerPath);
  if (!chunk) {
    return { content: [{ type: 'text', text: `No chunk found for headerPath "${headerPath}" in ${path}` }], isError: true };
  }

  // Blob-backed чтение.
  const contentHash = await getFileContentHash(chunk.indexed_file_id, viewId, path, indexedFileStorage);
  const fileContent = await loadFileContent(contentHash, source.path, path, fileBlobStorage);

  if (fileContent) {
    return formatFileFragment(fileContent, path, chunk.start_line ?? undefined, chunk.end_line ?? undefined, 0, {
      sourceType: chunk.source_type,
      headerPath: chunk.header_path,
    });
  }

  // Fallback: возвращаем содержимое чанка.
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        content: chunk.content,
        path,
        sourceType: chunk.source_type,
        metadata: { headerPath: chunk.header_path },
      }, null, 2),
    }],
  };
}

async function readByCoordinates(
  sourceName: string,
  path: string,
  startLine: number | undefined,
  endLine: number | undefined,
  context: number,
  sourceStorage: SourceStorage,
  fileBlobStorage: FileBlobStorage,
  indexedFileStorage: IndexedFileStorage,
  branch?: string,
): Promise<ToolResult> {
  console.log(`[read_source] mode=coordinates, source=${sourceName}, path=${path}, branch=${branch ?? 'active'}`);

  const source = await sourceStorage.getByName(sourceName);
  if (!source) {
    return { content: [{ type: 'text', text: `Source "${sourceName}" not found` }], isError: true };
  }

  // Определяем viewId: по branch или active_view_id.
  let viewId = source.active_view_id;
  if (branch) {
    // TODO: lookup view by branch name через SourceViewStorage (доступен через DI в server.ts).
    // Для координатного чтения используем active view как fallback.
    console.log(`[read_source] branch=${branch} — используем active_view_id (branch lookup будет в следующей итерации)`);
  }

  // Blob-backed чтение.
  if (viewId) {
    const indexedFile = await indexedFileStorage.getByPath(viewId, path);
    if (indexedFile) {
      const fileContent = await loadFileContent(indexedFile.content_hash, source.path, path, fileBlobStorage);
      if (fileContent) {
        return formatFileFragment(fileContent, path, startLine, endLine, context, {});
      }
    }
  }

  // FS fallback.
  if (source.path) {
    const absolutePath = join(source.path, path);
    try {
      const fileContent = await readFile(absolutePath, 'utf-8');
      return formatFileFragment(fileContent, path, startLine, endLine, context, {});
    } catch {
      return { content: [{ type: 'text', text: `Cannot read file: ${absolutePath}` }], isError: true };
    }
  }

  return { content: [{ type: 'text', text: `Cannot resolve file: ${sourceName}/${path}` }], isError: true };
}

// --- Форматирование фрагмента. ---

function formatFileFragment(
  fileContent: string,
  relativePath: string,
  startLine: number | undefined,
  endLine: number | undefined,
  context: number,
  metadata: Record<string, unknown>,
): ToolResult {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  let fragmentContent: string;
  let actualStart: number | undefined;
  let actualEnd: number | undefined;

  if (startLine === undefined && endLine === undefined) {
    fragmentContent = fileContent;
  } else {
    actualStart = Math.max(1, (startLine ?? 1) - context);
    actualEnd = Math.min(totalLines, (endLine ?? startLine ?? totalLines) + context);
    fragmentContent = lines.slice(actualStart - 1, actualEnd).join('\n');
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        content: fragmentContent,
        path: relativePath,
        sourceType: (metadata.sourceType as string | undefined) ?? 'text',
        metadata: {
          startLine: actualStart,
          endLine: actualEnd,
          headerPath: metadata.headerPath as string | undefined,
          language: metadata.language as string | undefined,
        },
      }, null, 2),
    }],
  };
}
