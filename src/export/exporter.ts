// Ядро экспорта: запрос данных из БД → SQL INSERT → архив.
import { mkdtemp, mkdir, writeFile, appendFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type postgres from 'postgres';
import { writeManifest, getSchemaVersion, getLocalRagVersion } from './manifest.js';
import { sanitizeConfig } from './sanitizer.js';
import { packArchive } from './archive.js';
import type { Manifest, ManifestSource } from './manifest.js';

// Размер батча для чтения чанков из БД.
const CHUNK_BATCH_SIZE = 1000;

export interface ExportOptions {
  sql: postgres.Sql;
  sourceIds: string[];
  includeEmbeddings: boolean;
  compress: boolean;
  outputPath: string;
  configPath: string | null;
  onProgress?: (sourceName: string, current: number, total: number) => void;
}

export interface ExportResult {
  archivePath: string;
  sourcesExported: number;
  totalChunks: number;
  fileSizeBytes: number;
}

// Экранирует значение для SQL INSERT.
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  // Массив чисел — pgvector литерал.
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
    return `'[${value.join(',')}]'::vector`;
  }

  // Объект/массив — JSONB.
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return `'${json.replace(/'/g, '\'\'')}'::jsonb`;
  }

  // Строка — экранируем спецсимволы для однострочного SQL (E-string синтаксис PostgreSQL).
  const str = String(value);
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\'\'')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `E'${escaped}'`;
}

// Генерирует INSERT-стейтмент для одной строки.
export function generateInsert(table: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row);
  const values = columns.map((col) => escapeValue(row[col]));
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

// Экспортирует данные из БД в архив.
export async function exportData(options: ExportOptions): Promise<ExportResult> {
  const { sql, sourceIds, includeEmbeddings, compress, outputPath, configPath, onProgress } = options;

  const tmpDir = await mkdtemp(join(tmpdir(), 'rag-export-'));
  const dataDir = join(tmpDir, 'data');
  await mkdir(dataDir, { recursive: true });

  let totalChunks = 0;
  const manifestSources: ManifestSource[] = [];

  try {
    for (const sourceId of sourceIds) {
      // Загружаем источник.
      const [source] = await sql<Array<{
        id: string;
        name: string;
        type: string;
        path: string | null;
        git_url: string | null;
        git_branch: string | null;
        config: Record<string, unknown>;
        last_indexed_at: Date | null;
        chunk_count: number;
        created_at: Date;
        updated_at: Date;
      }>>`SELECT * FROM sources WHERE id = ${sourceId}`;

      if (!source) continue;

      const sqlFilePath = join(dataDir, `${source.name}.sql`);
      const header = `-- Source: ${source.name}\n-- Exported: ${new Date().toISOString()}\n\n`;
      await writeFile(sqlFilePath, header, 'utf-8');

      // INSERT для sources.
      const sourceInsert = generateInsert('sources', {
        id: source.id,
        name: source.name,
        type: source.type,
        path: source.path,
        git_url: source.git_url,
        git_branch: source.git_branch,
        config: source.config,
        last_indexed_at: source.last_indexed_at,
        chunk_count: source.chunk_count,
        created_at: source.created_at,
        updated_at: source.updated_at,
      });
      await appendFile(sqlFilePath, `-- Source record\n${sourceInsert}\n\n`, 'utf-8');

      // Чанки батчами.
      let offset = 0;
      let sourceChunks = 0;
      let hasEmbeddings = false;

      // Подсчёт общего количества чанков.
      const [countResult] = await sql<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM chunks WHERE source_id = ${sourceId}
      `;
      const totalSourceChunks = parseInt(countResult!.count, 10);

      await appendFile(sqlFilePath, `-- Chunks (${totalSourceChunks} records)\n`, 'utf-8');

      while (true) {
        const chunks = await sql<Array<{
          id: string;
          source_id: string;
          content: string;
          content_hash: string;
          metadata: Record<string, unknown>;
          embedding: number[] | null;
          created_at: Date;
        }>>`
          SELECT id, source_id, content, content_hash, metadata, embedding, created_at
          FROM chunks
          WHERE source_id = ${sourceId}
          ORDER BY created_at
          LIMIT ${CHUNK_BATCH_SIZE}
          OFFSET ${offset}
        `;

        if (chunks.length === 0) break;

        for (const chunk of chunks) {
          if (chunk.embedding && chunk.embedding.length > 0) {
            hasEmbeddings = true;
          }

          const insert = generateInsert('chunks', {
            id: chunk.id,
            source_id: chunk.source_id,
            content: chunk.content,
            content_hash: chunk.content_hash,
            metadata: chunk.metadata,
            embedding: includeEmbeddings ? chunk.embedding : null,
            created_at: chunk.created_at,
          });
          await appendFile(sqlFilePath, insert + '\n', 'utf-8');
        }

        sourceChunks += chunks.length;
        offset += CHUNK_BATCH_SIZE;
        onProgress?.(source.name, sourceChunks, totalSourceChunks);
      }

      // Indexed files.
      const indexedFiles = await sql<Array<{
        id: string;
        source_id: string;
        path: string;
        file_hash: string;
        indexed_at: Date;
      }>>`
        SELECT * FROM indexed_files WHERE source_id = ${sourceId}
      `;

      if (indexedFiles.length > 0) {
        await appendFile(sqlFilePath, `\n-- Indexed files (${indexedFiles.length} records)\n`, 'utf-8');

        for (const file of indexedFiles) {
          const insert = generateInsert('indexed_files', {
            id: file.id,
            source_id: file.source_id,
            path: file.path,
            file_hash: file.file_hash,
            indexed_at: file.indexed_at,
          });
          await appendFile(sqlFilePath, insert + '\n', 'utf-8');
        }
      }

      totalChunks += sourceChunks;
      manifestSources.push({
        name: source.name,
        type: source.type as 'local' | 'git',
        path: source.path,
        chunksCount: sourceChunks,
        hasEmbeddings: includeEmbeddings && hasEmbeddings,
      });
    }

    // Манифест.
    const schemaVersion = await getSchemaVersion(sql);
    const localRagVersion = await getLocalRagVersion();

    const manifest: Manifest = {
      version: 1,
      schemaVersion,
      createdAt: new Date().toISOString(),
      localRagVersion,
      sources: manifestSources,
      includesEmbeddings: includeEmbeddings,
      includesConfig: configPath !== null,
    };
    await writeManifest(tmpDir, manifest);

    // Конфиг.
    if (configPath) {
      await sanitizeConfig(configPath, join(tmpDir, 'config.yaml'));
    }

    // Упаковка.
    await packArchive(tmpDir, outputPath, compress);

    // Размер файла.
    const archiveStat = await stat(outputPath);

    return {
      archivePath: outputPath,
      sourcesExported: manifestSources.length,
      totalChunks,
      fileSizeBytes: archiveStat.size,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
