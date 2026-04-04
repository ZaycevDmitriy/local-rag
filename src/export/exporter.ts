// Ядро экспорта v2: 6 таблиц branch-aware schema → SQL INSERT → архив.
import { mkdtemp, mkdir, writeFile, appendFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type postgres from 'postgres';
import { writeManifest, getSchemaVersion, getLocalRagVersion } from './manifest.js';
import { sanitizeConfig } from './sanitizer.js';
import { packArchive } from './archive.js';
import type { Manifest, ManifestSource } from './manifest.js';

// Размер батча для keyset pagination.
const BATCH_SIZE = 1000;

export interface ExportOptions {
  sql: postgres.Sql;
  sourceIds: string[];
  includeEmbeddings: boolean;
  compress: boolean;
  outputPath: string;
  configPath: string | null;
  onProgress?: (sourceName: string, table: string, current: number, total: number) => void;
}

export interface ExportResult {
  archivePath: string;
  sourcesExported: number;
  totalChunks: number;
  fileSizeBytes: number;
}

// Экранирует значение для SQL INSERT.
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;

  // Массив чисел — pgvector литерал.
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
    return `'[${value.join(',')}]'::vector`;
  }

  // Объект/массив — JSONB.
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return `'${json.replace(/'/g, '\'\'')}'::jsonb`;
  }

  // Строка — E-string синтаксис PostgreSQL.
  const str = String(value);
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\'\'')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `E'${escaped}'`;
}

// Content-addressed таблицы: INSERT ON CONFLICT DO NOTHING при импорте.
const CONTENT_ADDRESSED_TABLES = new Set(['file_blobs', 'chunk_contents']);

// Генерирует INSERT-стейтмент для одной строки.
export function generateInsert(table: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row);
  const values = columns.map((col) => escapeValue(row[col]));
  const suffix = CONTENT_ADDRESSED_TABLES.has(table) ? ' ON CONFLICT (content_hash) DO NOTHING' : '';
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})${suffix};`;
}

// Экспортирует данные v2 из БД в архив.
export async function exportData(options: ExportOptions): Promise<ExportResult> {
  const { sql, sourceIds, includeEmbeddings, compress, outputPath, configPath, onProgress } = options;

  const tmpDir = await mkdtemp(join(tmpdir(), 'rag-export-'));
  const dataDir = join(tmpDir, 'data');
  await mkdir(dataDir, { recursive: true });

  let totalChunks = 0;
  const manifestSources: ManifestSource[] = [];

  try {
    for (const sourceId of sourceIds) {
      // Загружаем source.
      const [source] = await sql<Array<{
        id: string; name: string; type: string; path: string | null;
        git_url: string | null; repo_root_path: string | null; repo_subpath: string | null;
        active_view_id: string | null; config: Record<string, unknown>;
        last_indexed_at: Date | null; created_at: Date; updated_at: Date;
      }>>`SELECT * FROM sources WHERE id = ${sourceId}`;

      if (!source) continue;

      const sqlFilePath = join(dataDir, `${source.name}.sql`);
      const header = `-- Source: ${source.name} (v2 branch-aware)\n-- Exported: ${new Date().toISOString()}\n\n`;
      await writeFile(sqlFilePath, header, 'utf-8');

      // 1. INSERT sources (active_view_id = NULL, чтобы не нарушать FK на source_views).
      await appendFile(sqlFilePath, '-- sources\n', 'utf-8');
      await appendFile(sqlFilePath, generateInsert('sources', {
        id: source.id, name: source.name, type: source.type, path: source.path,
        git_url: source.git_url, repo_root_path: source.repo_root_path,
        repo_subpath: source.repo_subpath, active_view_id: null,
        config: source.config, last_indexed_at: source.last_indexed_at,
        created_at: source.created_at, updated_at: source.updated_at,
      }) + '\n\n', 'utf-8');
      // UPDATE active_view_id добавляется в конце файла после вставки source_views.
      const activeViewUpdate = source.active_view_id
        ? `\n-- restore active_view_id\nUPDATE sources SET active_view_id = ${escapeValue(source.active_view_id)} WHERE id = ${escapeValue(source.id)};\n`
        : '';

      // 2. INSERT source_views.
      const views = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM source_views WHERE source_id = ${sourceId} ORDER BY created_at
      `;
      await appendFile(sqlFilePath, `-- source_views (${views.length})\n`, 'utf-8');
      for (const view of views) {
        await appendFile(sqlFilePath, generateInsert('source_views', view) + '\n', 'utf-8');
      }

      // 3. Собираем view IDs для фильтрации.
      const viewIds = views.map((v) => v.id as string);

      // 4. INSERT file_blobs (уникальные через indexed_files для этого source).
      const fileBlobs = await sql<Array<Record<string, unknown>>>`
        SELECT DISTINCT fb.* FROM file_blobs fb
        INNER JOIN indexed_files inf ON inf.content_hash = fb.content_hash
        INNER JOIN source_views sv ON sv.id = inf.source_view_id
        WHERE sv.source_id = ${sourceId}
      `;
      await appendFile(sqlFilePath, `\n-- file_blobs (${fileBlobs.length})\n`, 'utf-8');
      for (const blob of fileBlobs) {
        await appendFile(sqlFilePath, generateInsert('file_blobs', blob) + '\n', 'utf-8');
      }
      onProgress?.(source.name, 'file_blobs', fileBlobs.length, fileBlobs.length);

      // 5. INSERT indexed_files.
      if (viewIds.length > 0) {
        const indexedFiles = await sql<Array<Record<string, unknown>>>`
          SELECT * FROM indexed_files WHERE source_view_id = ANY(${viewIds}) ORDER BY indexed_at
        `;
        await appendFile(sqlFilePath, `\n-- indexed_files (${indexedFiles.length})\n`, 'utf-8');
        for (const file of indexedFiles) {
          await appendFile(sqlFilePath, generateInsert('indexed_files', file) + '\n', 'utf-8');
        }
      }

      // 6. INSERT chunk_contents (уникальные через chunks).
      const chunkContents = await sql<Array<{
        content_hash: string; content: string; embedding: number[] | null; created_at: Date;
      }>>`
        SELECT DISTINCT cc.content_hash, cc.content, cc.embedding, cc.created_at
        FROM chunk_contents cc
        INNER JOIN chunks c ON c.chunk_content_hash = cc.content_hash
        INNER JOIN source_views sv ON sv.id = c.source_view_id
        WHERE sv.source_id = ${sourceId}
      `;
      let hasEmbeddings = false;
      await appendFile(sqlFilePath, `\n-- chunk_contents (${chunkContents.length})\n`, 'utf-8');
      for (const cc of chunkContents) {
        if (cc.embedding && cc.embedding.length > 0) hasEmbeddings = true;
        await appendFile(sqlFilePath, generateInsert('chunk_contents', {
          content_hash: cc.content_hash,
          content: cc.content,
          embedding: includeEmbeddings ? cc.embedding : null,
          // search_vector — generated column, пропускаем.
          created_at: cc.created_at,
        }) + '\n', 'utf-8');
      }
      onProgress?.(source.name, 'chunk_contents', chunkContents.length, chunkContents.length);

      // 7. INSERT chunks (keyset pagination по UUID PK).
      let chunkCount = 0;
      if (viewIds.length > 0) {
        const [countResult] = await sql<[{ count: string }]>`
          SELECT COUNT(*)::text AS count FROM chunks WHERE source_view_id = ANY(${viewIds})
        `;
        const totalSourceChunks = parseInt(countResult!.count, 10);
        await appendFile(sqlFilePath, `\n-- chunks (${totalSourceChunks})\n`, 'utf-8');

        let cursorId: string | null = null;

        while (true) {
          const chunks: Array<Record<string, unknown>> = cursorId
            ? await sql<Array<Record<string, unknown>>>`
                SELECT * FROM chunks
                WHERE source_view_id = ANY(${viewIds}) AND id > ${cursorId}
                ORDER BY id LIMIT ${BATCH_SIZE}
              `
            : await sql<Array<Record<string, unknown>>>`
                SELECT * FROM chunks WHERE source_view_id = ANY(${viewIds})
                ORDER BY id LIMIT ${BATCH_SIZE}
              `;

          if (chunks.length === 0) break;

          const last = chunks[chunks.length - 1]!;
          cursorId = last.id as string;

          for (const chunk of chunks) {
            await appendFile(sqlFilePath, generateInsert('chunks', chunk) + '\n', 'utf-8');
          }

          chunkCount += chunks.length;
          onProgress?.(source.name, 'chunks', chunkCount, totalSourceChunks);
        }
      }

      // Восстановление active_view_id после вставки всех зависимостей.
      if (activeViewUpdate) {
        await appendFile(sqlFilePath, activeViewUpdate, 'utf-8');
      }

      totalChunks += chunkCount;
      manifestSources.push({
        name: source.name,
        type: source.type as 'local' | 'git',
        path: source.path,
        viewCount: views.length,
        chunkCount,
        fileBlobCount: fileBlobs.length,
        chunkContentCount: chunkContents.length,
        hasEmbeddings: includeEmbeddings && hasEmbeddings,
      });
    }

    // Манифест v2.
    const schemaVersion = await getSchemaVersion(sql);
    const localRagVersion = await getLocalRagVersion();

    const manifest: Manifest = {
      version: 2,
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
