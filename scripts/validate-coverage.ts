#!/usr/bin/env npx tsx
/**
 * Валидация полноты индексации источника.
 * Печатает coverage-метрики и завершается с exit 1, если порог не достигнут.
 *
 * Использование:
 *   npx tsx scripts/validate-coverage.ts --source <name> [--min <0-100>] [--config <path>]
 *
 * Опции:
 *   --source  Имя источника (обязательно).
 *   --min     Минимальный приемлемый % покрытия (по умолчанию 95).
 *   --config  Путь к rag.config.yaml.
 *
 * Проверяемые пороги:
 *   1. chunksWithEmbedding / totalChunks ≥ min%
 *   2. totalChunks > 0 (источник реально проиндексирован)
 *
 * Exit codes:
 *   0 — оба порога пройдены.
 *   1 — порог(и) не достигнуты или источник не найден.
 */
import { loadConfig } from '../src/config/index.js';
import {
  createDb,
  closeDb,
  SourceStorage,
} from '../src/storage/index.js';

// --- Разбор аргументов. ---

interface Args {
  source: string;
  min: number;
  config?: string;
}

function parseArgs(argv: string[]): Args {
  let source: string | undefined;
  let min = 95;
  let config: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') {
      source = argv[++i];
    } else if (arg === '--min') {
      min = Number(argv[++i]);
    } else if (arg === '--config') {
      config = argv[++i];
    }
  }

  if (!source) {
    throw new Error('Usage: validate-coverage.ts --source <name> [--min 95] [--config <path>]');
  }
  if (!Number.isFinite(min) || min < 0 || min > 100) {
    throw new Error(`Invalid --min: ${min}. Must be 0..100.`);
  }

  return { source, min, config };
}

// --- Основная логика. ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const appConfig = await loadConfig(args.config);
  const sql = createDb(appConfig.database);

  try {
    const sourceStorage = new SourceStorage(sql);
    const source = await sourceStorage.getByName(args.source);
    if (!source) {
      console.error(`Источник "${args.source}" не найден в БД.`);
      process.exit(1);
    }

    // totalChunks и chunksWithEmbedding через join chunks → chunk_contents.
    const totals = await sql<Array<{ total: string; with_embedding: string }>>`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE cc.embedding IS NOT NULL)::text AS with_embedding
      FROM chunks c
      JOIN chunk_contents cc ON c.chunk_content_hash = cc.content_hash
      JOIN indexed_files f ON c.indexed_file_id = f.id
      JOIN source_views sv ON f.source_view_id = sv.id
      WHERE sv.source_id = ${source.id}
    `;

    const totalChunks = Number(totals[0]?.total ?? 0);
    const withEmbedding = Number(totals[0]?.with_embedding ?? 0);

    // totalFiles — по distinct indexed_files для source.
    const fileRows = await sql<Array<{ total: string }>>`
      SELECT COUNT(DISTINCT f.id)::text AS total
      FROM indexed_files f
      JOIN source_views sv ON f.source_view_id = sv.id
      WHERE sv.source_id = ${source.id}
    `;
    const totalFiles = Number(fileRows[0]?.total ?? 0);

    const embedCoverage = totalChunks === 0 ? 0 : (withEmbedding / totalChunks) * 100;

    console.log(`--- Coverage для источника "${args.source}" ---`);
    console.log(`Файлов проиндексировано: ${totalFiles}`);
    console.log(`Всего chunks: ${totalChunks}`);
    console.log(`Chunks с embedding: ${withEmbedding}`);
    console.log(`Embedding coverage: ${embedCoverage.toFixed(2)}%`);
    console.log(`Порог min: ${args.min}%`);

    let failed = false;
    if (totalChunks === 0) {
      console.error('ERROR: источник проиндексирован без chunks. Запустите rag index сначала.');
      failed = true;
    }
    if (embedCoverage < args.min) {
      console.error(
        `ERROR: embedding coverage ${embedCoverage.toFixed(2)}% ниже порога ${args.min}%. ` +
        'Запустите rag re-embed.',
      );
      failed = true;
    }

    if (failed) {
      process.exit(1);
    }

    console.log('OK: coverage в пределах порога.');
  } finally {
    await closeDb(sql);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`validate-coverage failed: ${message}`);
  process.exit(1);
});
