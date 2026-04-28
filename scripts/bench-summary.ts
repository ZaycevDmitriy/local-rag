#!/usr/bin/env npx tsx
/**
 * A/B benchmark для AI-powered summarization: 2-way (baseline) vs 3-way (treatment).
 *
 * Использование:
 *   npx tsx scripts/bench-summary.ts [--mode baseline|treatment|both]
 *                                    [--baseline .ai-factory/benchmarks/summary-baseline.json]
 *                                    [--config rag.config.yaml]
 *                                    [--json]
 *
 * Mode semantics:
 *   baseline  — useSummaryVector=false (только BM25 + vec-content).
 *   treatment — useSummaryVector=true (3-way, если БД содержит summary).
 *   both      — оба прогона подряд (по одной БД), в stdout выдаёт дельту метрик.
 *
 * Метрики: Recall@5, Recall@10, MRR; per-category breakdown.
 * Exit 0 всегда (merge-criterion — решение автора; см. .ai-factory/benchmarks/README.md).
 */
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config/index.js';
import type { AppConfig, SearchConfig } from '../src/config/index.js';
import {
  createDb,
  closeDb,
  ChunkStorage,
  ChunkContentStorage,
  SourceStorage,
  SourceViewStorage,
} from '../src/storage/index.js';
import { createTextEmbedder } from '../src/embeddings/index.js';
import { createReranker } from '../src/search/reranker/index.js';
import { SearchCoordinator } from '../src/search/coordinator.js';
import {
  matchByPathAndLineRange,
  validateBaselineFile,
  type BaselineFile,
  type BaselineQuery,
} from './bench-summary-helpers.js';

type Mode = 'baseline' | 'treatment' | 'both';

interface QueryResult {
  query: string;
  category: string;
  hitsTop5: boolean;
  hitsTop10: boolean;
  rank: number | null;
}

interface Metrics {
  mode: Mode;
  totalQueries: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  perCategory: Record<string, { total: number; recallAt5: number; recallAt10: number; mrr: number }>;
}

// --- Разбор аргументов. ---

function parseArgs(argv: string[]): {
  mode: Mode;
  baselinePath: string;
  config?: string;
  json: boolean;
} {
  let mode: Mode = 'both';
  let baselinePath = '.ai-factory/benchmarks/summary-baseline.json';
  let config: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      const v = argv[++i];
      if (v !== 'baseline' && v !== 'treatment' && v !== 'both') {
        throw new Error(`Invalid --mode: ${v}. Expected baseline|treatment|both.`);
      }
      mode = v;
    } else if (arg === '--baseline') {
      baselinePath = argv[++i]!;
    } else if (arg === '--config') {
      config = argv[++i];
    } else if (arg === '--json') {
      json = true;
    }
  }

  return { mode, baselinePath, config, json };
}

// --- Загрузка golden set. ---

function loadBaseline(path: string): BaselineFile {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return validateBaselineFile(parsed);
}

// --- Оценка одной query. ---

async function evaluateQuery(
  coordinator: SearchCoordinator,
  sourceName: string,
  q: BaselineQuery,
  topK: number,
): Promise<QueryResult> {
  const response = await coordinator.search({ query: q.query, sourceName, topK });

  let rank: number | null = null;
  for (let i = 0; i < response.results.length; i++) {
    const result = response.results[i]!;
    if (q.expected.some((expected) => matchByPathAndLineRange(expected, result))) {
      rank = i + 1;
      break;
    }
  }
  // TODO(#13): optional fqn-bonus counter — read candidate.coordinates.fqn.

  return {
    query: q.query,
    category: q.category,
    hitsTop5: rank !== null && rank <= 5,
    hitsTop10: rank !== null && rank <= 10,
    rank,
  };
}

// --- Агрегация метрик. ---

function aggregate(mode: Mode, results: QueryResult[]): Metrics {
  const total = results.length;
  const top5 = results.filter((r) => r.hitsTop5).length;
  const top10 = results.filter((r) => r.hitsTop10).length;
  const mrrSum = results.reduce((sum, r) => sum + (r.rank !== null ? 1 / r.rank : 0), 0);

  const categories = new Map<string, QueryResult[]>();
  for (const r of results) {
    if (!categories.has(r.category)) categories.set(r.category, []);
    categories.get(r.category)!.push(r);
  }

  const perCategory: Metrics['perCategory'] = {};
  for (const [cat, rs] of categories) {
    const n = rs.length;
    perCategory[cat] = {
      total: n,
      recallAt5: rs.filter((r) => r.hitsTop5).length / n,
      recallAt10: rs.filter((r) => r.hitsTop10).length / n,
      mrr: rs.reduce((s, r) => s + (r.rank !== null ? 1 / r.rank : 0), 0) / n,
    };
  }

  return {
    mode,
    totalQueries: total,
    recallAt5: total === 0 ? 0 : top5 / total,
    recallAt10: total === 0 ? 0 : top10 / total,
    mrr: total === 0 ? 0 : mrrSum / total,
    perCategory,
  };
}

// --- Вывод таблицы. ---

function printMetrics(m: Metrics): void {
  console.log(`--- Mode: ${m.mode} ---`);
  console.log(`Queries: ${m.totalQueries}`);
  console.log(`Recall@5:  ${(m.recallAt5 * 100).toFixed(1)}%`);
  console.log(`Recall@10: ${(m.recallAt10 * 100).toFixed(1)}%`);
  console.log(`MRR:       ${m.mrr.toFixed(3)}`);
  console.log('Per-category:');
  for (const [cat, c] of Object.entries(m.perCategory)) {
    console.log(
      `  ${cat.padEnd(12)} n=${c.total}  ` +
      `R@5=${(c.recallAt5 * 100).toFixed(0)}%  ` +
      `R@10=${(c.recallAt10 * 100).toFixed(0)}%  ` +
      `MRR=${c.mrr.toFixed(2)}`,
    );
  }
  console.log('');
}

// --- Построение coordinator. ---

function buildCoordinator(
  sql: import('postgres').Sql,
  appConfig: AppConfig,
  searchOverride: Partial<SearchConfig>,
): SearchCoordinator {
  const sourceStorage = new SourceStorage(sql);
  const chunkStorage = new ChunkStorage(sql);
  const chunkContentStorage = new ChunkContentStorage(sql);
  const sourceViewStorage = new SourceViewStorage(sql);
  const embedder = createTextEmbedder(appConfig.embeddings);
  const reranker = createReranker(appConfig.reranker);

  const searchConfig: SearchConfig = { ...appConfig.search, ...searchOverride };

  return new SearchCoordinator(
    chunkStorage,
    sourceStorage,
    embedder,
    searchConfig,
    reranker,
    chunkContentStorage,
    sourceViewStorage,
  );
}

// --- Прогон одного режима. ---

async function runMode(
  sql: import('postgres').Sql,
  appConfig: AppConfig,
  baseline: BaselineFile,
  mode: 'baseline' | 'treatment',
): Promise<Metrics> {
  const useSummary = mode === 'treatment';
  const coordinator = buildCoordinator(sql, appConfig, { useSummaryVector: useSummary });

  const results: QueryResult[] = [];
  for (const q of baseline.queries) {
    const r = await evaluateQuery(coordinator, baseline.source, q, 10);
    results.push(r);
  }

  return aggregate(mode, results);
}

// --- Главный сценарий. ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseline = loadBaseline(args.baselinePath);
  const appConfig = await loadConfig(args.config);
  const sql = createDb(appConfig.database);

  const allMetrics: Metrics[] = [];
  try {
    if (args.mode === 'baseline' || args.mode === 'both') {
      allMetrics.push(await runMode(sql, appConfig, baseline, 'baseline'));
    }
    if (args.mode === 'treatment' || args.mode === 'both') {
      allMetrics.push(await runMode(sql, appConfig, baseline, 'treatment'));
    }
  } finally {
    await closeDb(sql);
  }

  if (args.json) {
    console.log(JSON.stringify({ source: baseline.source, metrics: allMetrics }, null, 2));
    return;
  }

  for (const m of allMetrics) {
    printMetrics(m);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`bench-summary failed: ${message}`);
  process.exit(1);
});
