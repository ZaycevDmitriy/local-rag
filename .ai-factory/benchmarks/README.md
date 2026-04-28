# Benchmark: AI-powered summarization

Golden set для A/B-сравнения 2-way (BM25 + vec-content) и 3-way (BM25 + vec-content + vec-summary) поиска.

## Файлы

- `summary-baseline.json` — список запросов и ожидаемых релевантных chunks.
- Метрики: Recall@5, Recall@10, MRR, per-category breakdown.

## Схема `summary-baseline.json`

```ts
interface Baseline {
  version: 2;
  source: string; // Имя источника (должно совпадать с sources[].name).
  description: string;
  queries: Array<{
    query: string; // developer-style парафраз, а не цитата из docs.
    expected: Array<{
      path: string; // Нормализованный относительный путь от repo root.
      startLine: number;
      endLine: number;
      fqn?: string; // Опциональный бонус, не required.
    }>;
    category: string; // auth | payment | order_sync | receipt_printing | navigation_ui.
    difficulty?: 'easy' | 'medium' | 'hard';
    seedKind?: 'manual' | 'hard-case' | 'llm-generated';
  }>;
}
```

Запрос считается «hit», если хотя бы один элемент `expected[]` совпадает с результатом поиска по `path` + пересечению диапазона `[startLine..endLine]`. FQN-match — опциональный бонус, не required.

## Changelog

- v2 (2026-04-23): replaced `goldenFqns: string[]` with `expected: [{ path, startLine, endLine, fqn? }]`.
  Rationale: FQN metadata не сохранялся в БД до PR-A fix; path-based matching соответствует практике CodeSearchNet/CoIR.

## Воспроизводимость набора

1. Seed v2 содержит 20 вручную проверенных запросов по KariPos: auth, payment, order_sync, receipt_printing, navigation_ui.
2. Для каждого запроса `path/startLine/endLine` взяты из реальных indexed chunks источника `karipos`.
3. `fqn` заполнен только там, где он стабильно присутствует в `chunks.metadata`.
4. При расширении набора проверять JSON через `npx tsx scripts/bench-summary.ts --mode baseline --json` на локальной БД.

## Запуск benchmark

```bash
# 0. Убедиться, что embedding coverage достаточный.
npx tsx scripts/validate-coverage.ts --source karipos --min 95

# 1. Baseline (useSummaryVector: false).
npx tsx scripts/bench-summary.ts --mode baseline

# 2. Treatment (useSummaryVector: true). Предварительно заполнить summary:
npx tsx src/cli.ts summarize --source karipos --dry-run
npx tsx src/cli.ts summarize --source karipos

# 3. Treatment запуск.
npx tsx scripts/bench-summary.ts --mode treatment

# 4. JSON для вложения в PR:
npx tsx scripts/bench-summary.ts --mode both --json > .ai-factory/benchmarks/bench-result-2026-04-28.json
```

## Operational notes

- 2026-04-28: после reindex `karipos` и нормализации ранее double-encoded `chunks.metadata`
  в БД найдено `817` chunk occurrences с `metadata.fqn`.
- 2026-04-28: зафиксирован benchmark-result:
  `summary-baseline-results-2026-04-28.md`, `bench-result-2026-04-28.json`.
  Baseline и treatment: Recall@5 `65.0%`, Recall@10 `80.0%`.
  Raw summary embedding coverage `64.4%`; eligible coverage excluding skipped/failed rows `98.7%`.

## Merge criterion

Фича одобряется, если:

- Recall@5 на treatment не хуже baseline.
- Baseline и treatment имеют non-zero Recall@5 на v2 golden set.
- Summary coverage по уникальным `chunk_contents.content_hash` не ниже 90%, иначе treatment фактически деградирует к 2-way.

Exit 0 скрипта не блокирует merge — решение принимает автор.
