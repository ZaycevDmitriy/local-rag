// Ядро импорта: распаковка → валидация → выполнение SQL.
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type postgres from 'postgres';
import { readManifest, getSchemaVersion } from './manifest.js';
import { unpackArchive } from './archive.js';

export interface ImportOptions {
  sql: postgres.Sql;
  archivePath: string;
  sourceNames: string[] | 'all';
  force: boolean;
  remapPath?: { from: string; to: string };
  onProgress?: (sourceName: string, status: 'importing' | 'done' | 'skipped') => void;
  onConflict?: (sourceName: string, chunksCount: number) => Promise<boolean>;
}

export interface ImportResult {
  sourcesImported: number;
  sourcesSkipped: number;
  totalChunks: number;
  warnings: string[];
}

// Разбирает SQL-файл на отдельные стейтменты.
export function parseStatements(content: string): string[] {
  const statements: string[] = [];
  let current = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Пропускаем комментарии и пустые строки.
    if (trimmed.startsWith('--') || trimmed === '') {
      continue;
    }

    current += line + '\n';

    // Стейтмент завершается точкой с запятой.
    if (trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }

  return statements;
}

// Импортирует данные из архива в БД.
export async function importData(options: ImportOptions): Promise<ImportResult> {
  const { sql, archivePath, sourceNames, force, remapPath, onProgress, onConflict } = options;

  const tmpDir = await mkdtemp(join(tmpdir(), 'rag-import-'));

  try {
    // Распаковка.
    await unpackArchive(archivePath, tmpDir);

    // Валидация манифеста.
    const manifest = await readManifest(tmpDir);

    // Проверка версии схемы.
    const currentSchema = await getSchemaVersion(sql);
    if (manifest.schemaVersion !== currentSchema) {
      throw new Error(
        'Schema version mismatch. ' +
        `Dump schema: ${manifest.schemaVersion}, Current DB schema: ${currentSchema}. ` +
        'Run \'rag init\' to apply pending migrations.',
      );
    }

    // Определяем источники для импорта.
    const sourcesToImport = sourceNames === 'all'
      ? manifest.sources
      : manifest.sources.filter((s) => sourceNames.includes(s.name));

    let sourcesImported = 0;
    let sourcesSkipped = 0;
    let totalChunks = 0;
    const warnings: string[] = [];

    for (const manifestSource of sourcesToImport) {
      const sqlFilePath = join(tmpDir, 'data', `${manifestSource.name}.sql`);

      // Проверяем конфликт.
      const existing = await sql<Array<{ id: string; chunk_count: number }>>`
        SELECT id, chunk_count FROM sources WHERE name = ${manifestSource.name}
      `;

      if (existing.length > 0) {
        if (!force) {
          if (onConflict) {
            const overwrite = await onConflict(manifestSource.name, existing[0]!.chunk_count);
            if (!overwrite) {
              onProgress?.(manifestSource.name, 'skipped');
              sourcesSkipped++;
              continue;
            }
          } else {
            onProgress?.(manifestSource.name, 'skipped');
            sourcesSkipped++;
            continue;
          }
        }
      }

      onProgress?.(manifestSource.name, 'importing');

      // Читаем SQL-файл.
      let sqlContent: string;
      try {
        sqlContent = await readFile(sqlFilePath, 'utf-8');
      } catch {
        warnings.push(`SQL file not found for source: ${manifestSource.name}`);
        sourcesSkipped++;
        continue;
      }

      const statements = parseStatements(sqlContent);

      // Импорт в транзакции.
      await sql.begin(async (tx: unknown) => {
        const query = tx as postgres.Sql;

        // Удаляем старые данные если конфликт.
        if (existing.length > 0) {
          const sourceId = existing[0]!.id;
          await query`DELETE FROM indexed_files WHERE source_id = ${sourceId}`;
          await query`DELETE FROM chunks WHERE source_id = ${sourceId}`;
          await query`DELETE FROM sources WHERE id = ${sourceId}`;
        }

        // Выполняем SQL-стейтменты.
        for (const stmt of statements) {
          await query.unsafe(stmt);
        }

        // Remap путей.
        if (remapPath) {
          await query.unsafe(
            `UPDATE sources SET path = REPLACE(path, '${remapPath.from.replace(/'/g, '\'\'')}', '${remapPath.to.replace(/'/g, '\'\'')}') WHERE name = '${manifestSource.name.replace(/'/g, '\'\'')}'`,
          );
          await query.unsafe(
            `UPDATE chunks SET metadata = jsonb_set(metadata, '{path}', to_jsonb(REPLACE(metadata->>'path', '${remapPath.from.replace(/'/g, '\'\'')}', '${remapPath.to.replace(/'/g, '\'\'')}'))) WHERE source_id = (SELECT id FROM sources WHERE name = '${manifestSource.name.replace(/'/g, '\'\'')}')`,
          );
        }
      });

      // Предупреждение о недоступных путях.
      if (manifestSource.type === 'local' && manifestSource.path) {
        const pathToCheck = remapPath
          ? manifestSource.path.replace(remapPath.from, remapPath.to)
          : manifestSource.path;

        try {
          await access(pathToCheck);
        } catch {
          warnings.push(
            `Source '${manifestSource.name}' references path '${pathToCheck}' ` +
            'which does not exist on this machine. ' +
            'Search will work (data is in DB), but \'read_source\' won\'t be able to read files. ' +
            'Use --remap-path to update paths.',
          );
        }
      }

      totalChunks += manifestSource.chunksCount;
      sourcesImported++;
      onProgress?.(manifestSource.name, 'done');
    }

    return { sourcesImported, sourcesSkipped, totalChunks, warnings };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// Возвращает список SQL-файлов в архиве (для интерактивного выбора).
export async function listArchiveSources(archivePath: string): Promise<string[]> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'rag-list-'));

  try {
    await unpackArchive(archivePath, tmpDir);
    const manifest = await readManifest(tmpDir);
    return manifest.sources.map((s) => s.name);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
