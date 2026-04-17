# Benchmark: AI-powered summarization

Golden set для A/B-сравнения 2-way (BM25 + vec-content) и 3-way (BM25 + vec-content + vec-summary) поиска.

## Файлы

- `summary-baseline.json` — список запросов и ожидаемых FQN-ответов.
- Метрики: Recall@5, Recall@10, MRR, per-category breakdown.

## Схема `summary-baseline.json`

```ts
interface Baseline {
  version: 1;
  source: string;            // Имя источника (должно совпадать с sources[].name).
  description: string;
  queries: Array<{
    query: string;           // developer-style парафраз, а не цитата из docs.
    goldenFqns: string[];    // 1–3 FQN, которые должны попасть в top-K.
    category: string;        // auth | payments | infra | ui | storage | integration | sync | perf | config.
    difficulty: 'easy' | 'medium' | 'hard';
    seedKind: 'manual' | 'hard-case' | 'llm-generated';
  }>;
}
```

Запрос считается «hit», если хотя бы один из `goldenFqns` присутствует в top-K результатов поиска (по `chunk.metadata.fqn`).

## Воспроизводимость набора

1. **Seed (9 вручную)** — отобраны из ключевых модулей KariPos (auth, payments, infra, UI, storage, integration, sync, perf, config). Hard cases взяты из `.claude/research/local-rag-indexing-issues.md`.
2. **Расширение до 30 через LLM-generation.** Запустить одноразовую Claude-сессию в `/Users/zajcevdmitrij/Work_folder/Kari/KariPos-APP.UI` с промтом:

   > Ты анализируешь код и документацию KariPos. Сгенерируй до 30 developer-style поисковых запросов с ожидаемыми FQN. Критично: `paraphrase as developer would ask, NOT as in docs`. Используй неформальный тон, синонимы, транслит. Для каждого запроса: 1-3 `goldenFqns`, категорию, сложность.

3. **Human review ~30 мин.** — прочитать, отбросить плохие парафразы, проверить, что FQN действительно существуют в текущем индексе.
4. Сохранить результат в `summary-baseline.json`, сохранив схему.

## Запуск benchmark

```bash
# 0. Убедиться, что coverage достаточный.
npx tsx scripts/validate-coverage.ts --source karipos --min 95

# 1. Baseline (useSummaryVector: false).
npx tsx scripts/bench-summary.ts --mode baseline

# 2. Treatment (useSummaryVector: true). Предварительно заполнить summary:
rag summarize --dry-run --source karipos
rag summarize --source karipos

# 3. Treatment запуск.
npx tsx scripts/bench-summary.ts --mode treatment

# 4. JSON для вложения в PR:
npx tsx scripts/bench-summary.ts --mode both --json > bench-result.json
```

## Merge criterion

Фича одобряется, если:

- Recall@5 (hard cases) treatment ≥ baseline (не хуже).
- Субъективная top-5 оценка на `concept queries` лучше в treatment.

Exit 0 скрипта не блокирует merge — решение принимает автор.
