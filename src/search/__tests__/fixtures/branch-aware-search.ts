// Seed helper для branch-aware search benchmark и тестов.
import { randomUUID, createHash } from 'node:crypto';
import type postgres from 'postgres';

// Конфигурация seed данных.
export interface SeedConfig {
  sourceCount: number;
  viewsPerSource: number;
  filesPerView: number;
  chunksPerFile: number;
  embeddingDimensions: number;
}

// Результат seed.
export interface SeedResult {
  sourceIds: string[];
  viewIds: string[];
  chunkContentHashes: string[];
  totalChunks: number;
  totalFiles: number;
}

// Дефолтная конфигурация: ~3000 chunks, 3 sources × 2 views × 100 files × 5 chunks.
export const DEFAULT_SEED_CONFIG: SeedConfig = {
  sourceCount: 3,
  viewsPerSource: 2,
  filesPerView: 100,
  chunksPerFile: 5,
  embeddingDimensions: 1024,
};

// Генерирует случайный вектор заданной размерности.
function randomVector(dims: number): number[] {
  const vec = new Array(dims);
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.random() * 2 - 1;
  }
  return vec;
}

// SHA-256 хэш строки.
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// Словарь для генерации реалистичного контента (BM25-тестирование).
const WORDS = [
  'function', 'export', 'import', 'const', 'class', 'interface',
  'async', 'await', 'return', 'type', 'string', 'number',
  'boolean', 'array', 'object', 'promise', 'error', 'handler',
  'database', 'query', 'search', 'index', 'vector', 'embedding',
  'storage', 'source', 'chunk', 'content', 'hash', 'path',
  'branch', 'commit', 'tree', 'view', 'snapshot', 'fingerprint',
  'reranker', 'fusion', 'score', 'rank', 'filter', 'prefix',
  'config', 'schema', 'migration', 'table', 'column', 'constraint',
  'typescript', 'javascript', 'postgresql', 'pgvector', 'tsvector',
  'module', 'service', 'repository', 'factory', 'dispatcher',
];

// Генерирует реалистичный текстовый контент для чанка.
function generateContent(fileIdx: number, chunkIdx: number): string {
  const lines: string[] = [];
  const lineCount = 10 + Math.floor(Math.random() * 20);
  for (let i = 0; i < lineCount; i++) {
    const wordCount = 3 + Math.floor(Math.random() * 8);
    const words = Array.from({ length: wordCount }, () =>
      WORDS[Math.floor(Math.random() * WORDS.length)],
    );
    lines.push(words.join(' '));
  }
  // Добавляем идентифицируемую строку для точного BM25 поиска.
  lines.push(`// file_${fileIdx}_chunk_${chunkIdx}_marker`);
  return lines.join('\n');
}

/**
 * Заполняет базу данных branch-aware тестовыми данными.
 * Использует raw SQL для максимальной скорости.
 *
 * Требует: миграция 005 уже применена.
 */
export async function seedBranchAwareData(
  sql: postgres.Sql,
  config: SeedConfig = DEFAULT_SEED_CONFIG,
): Promise<SeedResult> {
  const sourceIds: string[] = [];
  const viewIds: string[] = [];
  const chunkContentHashes: string[] = [];
  let totalChunks = 0;
  let totalFiles = 0;

  console.log(
    `[seed] начинаем: ${config.sourceCount} sources × ${config.viewsPerSource} views × ` +
    `${config.filesPerView} files × ${config.chunksPerFile} chunks`,
  );

  for (let s = 0; s < config.sourceCount; s++) {
    const sourceId = randomUUID();
    sourceIds.push(sourceId);

    // Вставляем source.
    await sql`
      INSERT INTO sources (id, name, type, path, config)
      VALUES (${sourceId}, ${'bench-source-' + s}, 'local', ${'/bench/source-' + s}, '{}')
    `;

    for (let v = 0; v < config.viewsPerSource; v++) {
      const viewId = randomUUID();
      viewIds.push(viewId);
      const refName = v === 0 ? 'main' : `feature/bench-${v}`;

      // Вставляем source_view.
      await sql`
        INSERT INTO source_views (id, source_id, view_kind, ref_name, snapshot_fingerprint, last_indexed_at)
        VALUES (${viewId}, ${sourceId}, 'branch', ${refName}, ${'tree:bench-' + viewId.slice(0, 12)}, now())
      `;

      // Первый view — active.
      if (v === 0) {
        await sql`UPDATE sources SET active_view_id = ${viewId} WHERE id = ${sourceId}`;
      }

      // Генерируем файлы и чанки.
      for (let f = 0; f < config.filesPerView; f++) {
        const fileId = randomUUID();
        const filePath = `src/module-${s}/file-${f}.ts`;
        const fileContent = generateContent(f, 0);
        const fileHash = sha256(fileContent);

        // file_blob.
        await sql`
          INSERT INTO file_blobs (content_hash, content, byte_size)
          VALUES (${fileHash}, ${fileContent}, ${Buffer.byteLength(fileContent)})
          ON CONFLICT DO NOTHING
        `;

        // indexed_file.
        await sql`
          INSERT INTO indexed_files (id, source_view_id, path, content_hash)
          VALUES (${fileId}, ${viewId}, ${filePath}, ${fileHash})
        `;
        totalFiles++;

        // Чанки.
        for (let c = 0; c < config.chunksPerFile; c++) {
          const chunkContent = generateContent(f, c);
          const contentHash = sha256(chunkContent);
          const embedding = randomVector(config.embeddingDimensions);
          const vectorStr = `[${embedding.join(',')}]`;

          // chunk_content.
          await sql.unsafe(
            `INSERT INTO chunk_contents (content_hash, content, embedding)
             VALUES ($1, $2, $3::vector)
             ON CONFLICT DO NOTHING`,
            [contentHash, chunkContent, vectorStr],
          );
          chunkContentHashes.push(contentHash);

          // chunk occurrence.
          await sql`
            INSERT INTO chunks (source_view_id, indexed_file_id, chunk_content_hash, path, source_type, start_line, end_line, language, ordinal, metadata)
            VALUES (${viewId}, ${fileId}, ${contentHash}, ${filePath}, 'code', ${c * 20 + 1}, ${(c + 1) * 20}, 'typescript', ${c}, '{}')
          `;
          totalChunks++;
        }
      }

      console.log(`[seed] source=${s}, view=${v}: ${config.filesPerView} files, ${config.filesPerView * config.chunksPerFile} chunks`);
    }
  }

  console.log(`[seed] итого: ${sourceIds.length} sources, ${viewIds.length} views, ${totalFiles} files, ${totalChunks} chunks`);

  return {
    sourceIds,
    viewIds,
    chunkContentHashes: [...new Set(chunkContentHashes)],
    totalChunks,
    totalFiles,
  };
}

/**
 * Очищает benchmark данные.
 */
export async function cleanupSeedData(sql: postgres.Sql): Promise<void> {
  await sql`DELETE FROM sources WHERE name LIKE 'bench-source-%'`;
  console.log('[seed] cleanup завершён');
}
