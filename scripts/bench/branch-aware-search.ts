#!/usr/bin/env npx tsx
/**
 * Benchmark: BM25 query shapes и vector search strategies для branch-aware schema.
 *
 * Использование:
 *   npx tsx scripts/bench/branch-aware-search.ts [--seed] [--cleanup] [--explain]
 *
 * Опции:
 *   --seed      Заполнить БД тестовыми данными перед benchmark.
 *   --cleanup   Удалить тестовые данные после benchmark.
 *   --explain   Показать EXPLAIN ANALYZE для каждого запроса.
 *
 * Требования:
 *   PostgreSQL с применённой миграцией 005 (rag init).
 *   Конфигурация: rag.config.yaml или RAG_CONFIG.
 */
import { loadConfig } from '../../src/config/index.js';
import { createDb, closeDb } from '../../src/storage/index.js';
import {
  seedBranchAwareData,
  cleanupSeedData,
  DEFAULT_SEED_CONFIG,
} from '../../src/search/__tests__/fixtures/branch-aware-search.js';

// --- Типы. ---

interface BenchResult {
  scenario: string;
  shape: string;
  filterSelectivity: string;
  rowCount: number;
  timeMs: number;
  plan?: string;
}

// --- SQL-запросы: BM25 shape comparison. ---

// Shape A: GIN → expand → filter.
// Сначала GIN-индекс находит content_hash, потом JOIN на chunks и filter.
const BM25_SHAPE_A = `
  SELECT c.id, ts_rank(cc.search_vector, to_tsquery('simple', $1)) AS score
  FROM chunk_contents cc
  INNER JOIN chunks c ON c.chunk_content_hash = cc.content_hash
  WHERE cc.search_vector @@ to_tsquery('simple', $1)
    AND c.source_view_id = ANY($2::uuid[])
  ORDER BY score DESC
  LIMIT $3
`;

// Shape B: filter → join → GIN check.
// Сначала filter chunks по view, потом JOIN на content и GIN check.
const BM25_SHAPE_B = `
  SELECT c.id, ts_rank(cc.search_vector, to_tsquery('simple', $1)) AS score
  FROM chunks c
  INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
  WHERE c.source_view_id = ANY($2::uuid[])
    AND cc.search_vector @@ to_tsquery('simple', $1)
  ORDER BY score DESC
  LIMIT $3
`;

// Shape A с pathPrefix.
const BM25_SHAPE_A_PREFIX = `
  SELECT c.id, ts_rank(cc.search_vector, to_tsquery('simple', $1)) AS score
  FROM chunk_contents cc
  INNER JOIN chunks c ON c.chunk_content_hash = cc.content_hash
  WHERE cc.search_vector @@ to_tsquery('simple', $1)
    AND c.source_view_id = ANY($2::uuid[])
    AND c.path LIKE $4
  ORDER BY score DESC
  LIMIT $3
`;

// Shape B с pathPrefix.
const BM25_SHAPE_B_PREFIX = `
  SELECT c.id, ts_rank(cc.search_vector, to_tsquery('simple', $1)) AS score
  FROM chunks c
  INNER JOIN chunk_contents cc ON cc.content_hash = c.chunk_content_hash
  WHERE c.source_view_id = ANY($2::uuid[])
    AND c.path LIKE $4
    AND cc.search_vector @@ to_tsquery('simple', $1)
  ORDER BY score DESC
  LIMIT $3
`;

// --- SQL-запросы: Vector search strategies. ---

// Narrow: exact search по prefiltered content hashes.
const VECTOR_NARROW = `
  WITH filtered AS (
    SELECT DISTINCT c.chunk_content_hash
    FROM chunks c
    WHERE c.source_view_id = ANY($2::uuid[])
  )
  SELECT f.chunk_content_hash, cc.embedding <=> $1::vector AS distance
  FROM filtered f
  INNER JOIN chunk_contents cc ON cc.content_hash = f.chunk_content_hash
  WHERE cc.embedding IS NOT NULL
  ORDER BY distance
  LIMIT $3
`;

// Broad: ANN overfetch → filter.
const VECTOR_BROAD = `
  WITH ann AS (
    SELECT content_hash, embedding <=> $1::vector AS distance
    FROM chunk_contents
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3 * 3
  )
  SELECT c.id, ann.distance
  FROM ann
  INNER JOIN chunks c ON c.chunk_content_hash = ann.content_hash
  WHERE c.source_view_id = ANY($2::uuid[])
  ORDER BY ann.distance
  LIMIT $3
`;

// --- Runner. ---

async function runQuery(
  sql: ReturnType<typeof createDb>,
  queryText: string,
  params: (string | string[] | number)[],
  explain: boolean,
): Promise<{ rows: unknown[]; timeMs: number; plan?: string }> {
  let plan: string | undefined;

  if (explain) {
    const explainResult = await sql.unsafe(`EXPLAIN ANALYZE ${queryText}`, params);
    plan = explainResult.map((r: Record<string, unknown>) => r['QUERY PLAN']).join('\n');
  }

  const start = performance.now();
  const rows = await sql.unsafe(queryText, params);
  const timeMs = performance.now() - start;

  return { rows: rows as unknown[], timeMs, plan };
}

function randomVector(dims: number): number[] {
  const vec = new Array(dims);
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.random() * 2 - 1;
  }
  return vec;
}

async function runBenchmark(
  sql: ReturnType<typeof createDb>,
  viewIds: string[],
  explain: boolean,
  dims: number,
): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const LIMIT = 50;
  const ITERATIONS = 5;
  const queryTerms = ['function', 'database', 'search', 'vector & embedding', 'typescript & async'];

  console.log('\n=== BM25 Shape Comparison ===\n');

  // BM25 benchmarks.
  for (const term of queryTerms) {
    for (const [shape, queryText] of [['A (GIN→expand→filter)', BM25_SHAPE_A], ['B (filter→join→GIN)', BM25_SHAPE_B]] as const) {
      const times: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const { rows, timeMs, plan } = await runQuery(
          sql,
          queryText,
          [term, viewIds, LIMIT],
          explain && i === 0,
        );

        times.push(timeMs);

        if (i === 0) {
          const result: BenchResult = {
            scenario: `BM25 '${term}'`,
            shape,
            filterSelectivity: `${viewIds.length} views`,
            rowCount: (rows as unknown[]).length,
            timeMs: 0,
            plan,
          };
          results.push(result);
        }
      }

      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      results[results.length - 1]!.timeMs = Math.round(avgMs * 100) / 100;
    }
  }

  // BM25 с pathPrefix.
  console.log('\n=== BM25 + pathPrefix ===\n');

  for (const [shape, queryText] of [['A+prefix', BM25_SHAPE_A_PREFIX], ['B+prefix', BM25_SHAPE_B_PREFIX]] as const) {
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const { rows, timeMs, plan } = await runQuery(
        sql,
        queryText,
        ['function', viewIds, LIMIT, 'src/module-0/%'],
        explain && i === 0,
      );

      times.push(timeMs);

      if (i === 0) {
        results.push({
          scenario: 'BM25+prefix \'function\'',
          shape,
          filterSelectivity: `${viewIds.length} views + prefix`,
          rowCount: (rows as unknown[]).length,
          timeMs: 0,
          plan,
        });
      }
    }

    results[results.length - 1]!.timeMs = Math.round(
      (times.reduce((a, b) => a + b, 0) / times.length) * 100,
    ) / 100;
  }

  // Vector benchmarks.
  console.log('\n=== Vector Search Strategies ===\n');

  const queryVector = `[${randomVector(dims).join(',')}]`;

  for (const [shape, queryText] of [['narrow (exact)', VECTOR_NARROW], ['broad (ANN overfetch)', VECTOR_BROAD]] as const) {
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const { rows, timeMs, plan } = await runQuery(
        sql,
        queryText,
        [queryVector, viewIds, LIMIT],
        explain && i === 0,
      );

      times.push(timeMs);

      if (i === 0) {
        results.push({
          scenario: `vector ${shape}`,
          shape,
          filterSelectivity: `${viewIds.length} views`,
          rowCount: (rows as unknown[]).length,
          timeMs: 0,
          plan,
        });
      }
    }

    results[results.length - 1]!.timeMs = Math.round(
      (times.reduce((a, b) => a + b, 0) / times.length) * 100,
    ) / 100;
  }

  // Narrow с одним view (высокая selectivity).
  for (const [shape, queryText] of [['narrow-1view', VECTOR_NARROW], ['broad-1view', VECTOR_BROAD]] as const) {
    const singleView = [viewIds[0]!];
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const { rows, timeMs, plan } = await runQuery(
        sql,
        queryText,
        [queryVector, singleView, LIMIT],
        explain && i === 0,
      );

      times.push(timeMs);

      if (i === 0) {
        results.push({
          scenario: `vector ${shape}`,
          shape,
          filterSelectivity: '1 view (high selectivity)',
          rowCount: (rows as unknown[]).length,
          timeMs: 0,
          plan,
        });
      }
    }

    results[results.length - 1]!.timeMs = Math.round(
      (times.reduce((a, b) => a + b, 0) / times.length) * 100,
    ) / 100;
  }

  return results;
}

// --- Вывод результатов. ---

function printResults(results: BenchResult[], explain: boolean): void {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));

  // Таблица.
  console.log(
    '\n' +
    padRight('Scenario', 35) +
    padRight('Shape', 30) +
    padRight('Selectivity', 25) +
    padRight('Rows', 6) +
    padRight('Avg ms', 10),
  );
  console.log('-'.repeat(106));

  for (const r of results) {
    console.log(
      padRight(r.scenario, 35) +
      padRight(r.shape, 30) +
      padRight(r.filterSelectivity, 25) +
      padRight(String(r.rowCount), 6) +
      padRight(String(r.timeMs), 10),
    );
  }

  // BM25 winner.
  const bm25Results = results.filter((r) => r.scenario.startsWith('BM25'));
  const shapeATimes = bm25Results.filter((r) => r.shape.startsWith('A')).map((r) => r.timeMs);
  const shapeBTimes = bm25Results.filter((r) => r.shape.startsWith('B')).map((r) => r.timeMs);

  if (shapeATimes.length > 0 && shapeBTimes.length > 0) {
    const avgA = shapeATimes.reduce((a, b) => a + b, 0) / shapeATimes.length;
    const avgB = shapeBTimes.reduce((a, b) => a + b, 0) / shapeBTimes.length;
    const winner = avgA < avgB ? 'A (GIN→expand→filter)' : 'B (filter→join→GIN)';
    console.log(`\nBM25 winner: ${winner} (A avg=${avgA.toFixed(2)}ms, B avg=${avgB.toFixed(2)}ms)`);
  }

  // Vector narrow vs broad.
  const narrowResults = results.filter((r) => r.shape.includes('narrow'));
  const broadResults = results.filter((r) => r.shape.includes('broad'));
  if (narrowResults.length > 0 && broadResults.length > 0) {
    const narrowAvg = narrowResults.reduce((a, r) => a + r.timeMs, 0) / narrowResults.length;
    const broadAvg = broadResults.reduce((a, r) => a + r.timeMs, 0) / broadResults.length;
    console.log(`Vector: narrow avg=${narrowAvg.toFixed(2)}ms, broad avg=${broadAvg.toFixed(2)}ms`);
  }

  // EXPLAIN output.
  if (explain) {
    console.log('\n' + '='.repeat(80));
    console.log('EXPLAIN ANALYZE PLANS');
    console.log('='.repeat(80));
    for (const r of results) {
      if (r.plan) {
        console.log(`\n--- ${r.scenario} [${r.shape}] ---`);
        console.log(r.plan);
      }
    }
  }
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

// --- Main. ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldSeed = args.includes('--seed');
  const shouldCleanup = args.includes('--cleanup');
  const explain = args.includes('--explain');

  console.log('Branch-Aware Search Benchmark');
  console.log(`Options: seed=${shouldSeed}, cleanup=${shouldCleanup}, explain=${explain}`);

  const config = await loadConfig();
  const sql = createDb(config.database);

  try {
    let viewIds: string[];

    if (shouldSeed) {
      console.log('\n--- Seeding data ---');
      const seedResult = await seedBranchAwareData(sql, DEFAULT_SEED_CONFIG);
      viewIds = seedResult.viewIds;
    } else {
      // Используем существующие views.
      const views = await sql<Array<{ id: string }>>`
        SELECT sv.id FROM source_views sv
        INNER JOIN sources s ON s.id = sv.source_id
        WHERE s.name LIKE 'bench-source-%'
        ORDER BY sv.created_at
      `;

      if (views.length === 0) {
        console.error('Нет bench данных. Запустите с --seed для генерации.');
        process.exit(1);
      }

      viewIds = views.map((v) => v.id);
      console.log(`Найдено ${viewIds.length} bench views.`);
    }

    // Запуск benchmark.
    const results = await runBenchmark(
      sql,
      viewIds,
      explain,
      DEFAULT_SEED_CONFIG.embeddingDimensions,
    );

    printResults(results, explain);

    if (shouldCleanup) {
      console.log('\n--- Cleanup ---');
      await cleanupSeedData(sql);
    }
  } finally {
    await closeDb(sql);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
