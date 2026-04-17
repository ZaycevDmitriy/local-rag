# Implementation Plan: AI-powered summarization

Branch: `feature/ai-powered-summarization`
Created: 2026-04-17
Revision: v2 (iteration 1 of /aif-improve — DoD + rollback + dry-run + YAML examples)

## Settings
- Testing: yes
- Logging: verbose
- Docs: yes  <!-- mandatory docs checkpoint в /aif-implement -->

## Roadmap Linkage
Milestone: "AI-powered summarization"
Rationale: пункт из `.ai-factory/ROADMAP.md:7` (unchecked, формулировка: «LLM-генерация описаний чанков, dual-vector search по content + summary») — фича напрямую закрывает этот milestone и требует снять галочку после merge (задача T16).

## Research Context
Source: `.ai-factory/RESEARCH.md` (Active Summary)

**Topic:** AI-powered summarization — LLM-генерация описаний чанков, dual-vector search по content + summary.

**Goal (v1):** повысить качество семантического поиска для **естественно-языковых запросов** («how X works», «session refresh flow», «how payments work») через LLM-summary per-chunk; поиск становится 3-way (BM25 + content-vec + summary-vec) с RRF и rerank. Precision на FQN-запросах остаётся за текущим pipeline.

**Constraints:**
- Провайдер — **только SiliconFlow** (Jina deprecated). OpenAI-compat chat API, общий `SILICONFLOW_API_KEY`.
- Архитектура branch-aware (фаза 10) — `summary` и `summary_embedding` живут в `chunk_contents` (дедуп per `content_hash`).
- Фича **opt-in** per source; поиск работает когда `summary_embedding IS NULL` (graceful fallback на 2-way).
- Embedding-размерность = та же, что у основного `TextEmbedder`. Один embedder, один `query_vector`, оба HNSW.
- Не встраиваем в `rag index` — отдельная команда `rag summarize`.

**Decisions:**
- Хранение — `chunk_contents.summary` + `chunk_contents.summary_embedding`. Миграция 006 — `ALTER TABLE` без destructive, rollback описан в T01 и в Risks.
- Модель — `Qwen/Qwen2.5-7B-Instruct` ($0.05/M), хватит для S1.
- Формат — **S1 free-form**, 60-120 слов, **English output regardless of comment language** (LLM переводит domain-термины из русских комментариев).
- Query-fusion — 3-way RRF (BM25 + vec-content + vec-summary). Graceful fallback при NULL summary.
- Opt-in granularity — per-source + фильтр `sourceTypes=[code]`.
- Отдельная команда `rag summarize`, идемпотентная.
- Prompt: cached system + per-chunk user. System: «summarize for semantic search; 60-120 English words; never invent APIs». User: `Path/Kind/fqn/---/content`.
- Skip-strategy: Gate 1 (`content < 200 chars` → skip), Gate 2 (`TYPE/INTERFACE без docstring` → skip). На KariPos ~10-12K из ~18K чанков → ~$0.3-0.7 на Qwen2.5-7B.
- Post-check hallucinations — v1.5.

**Benchmark plan (option C, LLM-generated golden set):**
- Source: KariPos docs (`CLAUDE.md`, `docs/superpowers/`, `.claude/{specs,plans,research,reviews}/`, `fsd-audit-baseline.json`).
- One-shot Claude-сессия → 30 queries × `{query, goldenFqns[1-3], category}` + 3-5 hard cases из `.claude/research/local-rag-indexing-issues.md`.
- Critical bias в prompt: «paraphrase as developer would ask, NOT as in docs. Use informal tone, synonyms».
- Human review ~30 мин.
- Storage: `.ai-factory/benchmarks/summary-baseline.json`.
- Metrics: Recall@5, Recall@10, MRR. NDCG@10 снят.
- Fairness: одна БД, один embedder, один rerank, единственное различие — flag `useSummaryVec`.
- Merge criterion: Recall@5 растёт на hard cases + субъективная top-5 оценка на concept-запросах.

**Pre-requisite (блокер benchmark):**
- Текущий индекс KariPos — ~5% файлов, ~10% embeddings (зафиксировано в `.claude/research/local-rag-indexing-issues.md` в KariPos).
- Перед A/B — полная чистая переиндексация + валидация coverage (`scripts/validate-coverage.ts`, Task T13).

**Cost estimate (обязательный для T07 --dry-run):**
- KariPos: ~18K чанков × ~200 avg tokens × ~30% skip rate → ~12K API-calls.
- Qwen/Qwen2.5-7B-Instruct @ $0.05/M tokens: $0.30 – $0.70.
- `--dry-run` печатает оценку до реального прогона и завершает процесс с exit 0.

**Open questions (v2 backlog):**
- Q3 — BM25 по summary (отдельный tsvector + GIN). Только если vec-summary дал прирост.
- Context enrichment промта: `header_path` / enclosing class / соседние чанки.
- Автоматический hallucination-check.
- `rag index --summarize` flag.

---

## Commit Plan

| Commit | Tasks | Message |
|--------|-------|---------|
| 1 | T01, T02, T03 | `feat(summarize): migration 006, chunk_contents summary columns, config schema` |
| 2 | T04, T05, T06 | `feat(summarize): SiliconFlowSummarizer with prompt and skip gates` |
| 3 | T07 | `feat(cli): rag summarize backfill command` |
| 4 | T08, T09 | `feat(search): 3-way RRF with summary embeddings` |
| 5 | T10, T11, T12 | `test(summarize): unit tests for summarizer, storage, and 3-way search` |
| 6 | T13, T14, T15 | `chore(bench): validate-coverage script, golden set, bench-summary runner` |
| 7 | T16 | `docs(summarize): README, CLAUDE.md, spec, config example` |

Coverage-check: коммиты 1–7 покрывают все 16 задач (T01–T16) ровно по одному разу.

Правила безопасности:
- Коммиты 1–5 можно делать без внешних зависимостей.
- Коммит 6 предполагает **физический прогон** `rag index` на KariPos + валидацию — это runtime-действие пользователя (или полу-автомат в `/aif-implement`). Код коммита — сам скрипт и golden set.
- Коммит 7 — после того как benchmark дал результаты (или минимум прогона на части golden set).

---

## Tasks

> Легенда: **NEW** — создаётся впервые, **EDIT** — редактируется существующий файл.
> Для каждой задачи: Files / Steps / **DoD (acceptance)**.

### Phase 1: Storage & config foundation

#### T01 (id 1): [x] Миграция 006 — колонки summary + HNSW индекс
- Files:
  - `src/storage/migrations/006_summarization.ts` (**NEW**)
  - `src/storage/schema.ts` (**EDIT** — добавить `summary TEXT NULL`, `summary_embedding vector(N) NULL`)
  - `src/storage/index.ts` (**EDIT** — зарегистрировать миграцию 006)
  - `src/commands/init.ts` (**EDIT** — обеспечить idempotent запуск 006)
- Steps: `ALTER TABLE chunk_contents ADD COLUMN summary TEXT`, `ADD COLUMN summary_embedding vector(N)`; создать partial HNSW индекс `WHERE summary_embedding IS NOT NULL`.
- **Rollback plan** (up-only migrations, ручной откат):
  - `DROP INDEX IF EXISTS chunk_contents_summary_embedding_hnsw;`
  - `ALTER TABLE chunk_contents DROP COLUMN IF EXISTS summary_embedding;`
  - `ALTER TABLE chunk_contents DROP COLUMN IF EXISTS summary;`
  - Команды документируются в `docs/specs/ai-powered-summarization.md` (T16).
- **DoD**:
  - `npm run build` проходит.
  - `rag init` применяет 006 без ошибок на пустой БД и на БД после 005.
  - Повторный вызов `rag init` идемпотентен (skip).
  - После миграции `\d chunk_contents` содержит обе колонки + partial HNSW индекс.

#### T02 (id 2): [x] ChunkContentStorage — новые методы summary (depends on T01)
- Files:
  - `src/storage/chunk-contents.ts` (**EDIT**)
- Methods to add: `getWithNullSummary(limit, offset)`, `updateSummaries(rows: {hash, summary}[])`, `updateSummaryEmbeddings(rows: {hash, embedding}[])`, `searchSummaryVector(queryVec, topK, filter)`.
- **DoD**:
  - Все методы типизированы.
  - Batch-запросы используют keyset pagination (см. существующий `getForReEmbed`).
  - `searchSummaryVector` возвращает `ScoredChunk[]` с корректным scoring.
  - Unit-тесты из T11 проходят.

#### T03 (id 3): [x] Config схема — summarization + search 3-way
- Files:
  - `src/config/schema.ts` (**EDIT** — новый `SummarizationConfigSchema`, расширение `SearchConfigSchema`)
  - `src/config/defaults.ts` (**EDIT** — defaults)
  - `rag.config.yaml` (**EDIT** — закомментированный пример)
- Config additions:
  - `SummarizationConfigSchema`: `{ provider: 'siliconflow', model: string, concurrency: int, cost: { dryRunRequired: bool } }`.
  - `SearchConfigSchema`: `useSummaryVector: bool`, `summaryVectorWeight: number`, `.refine()` → `bm25Weight + vectorWeight + summaryVectorWeight ≈ 1.0 ± 0.01`.
- **YAML example** (вкатывается в `rag.config.yaml` и в T16 docs):
  ```yaml
  summarization:
    provider: siliconflow
    model: Qwen/Qwen2.5-7B-Instruct
    concurrency: 4
  search:
    bm25Weight: 0.2
    vectorWeight: 0.5
    summaryVectorWeight: 0.3
    useSummaryVector: true
  sources:
    - name: karipos
      summarize: true   # opt-in per source
  ```
- **DoD**:
  - Zod-схема валидирует sample YAML (юнит-тест на `parseConfig`).
  - Дефолт `useSummaryVector: false` (graceful opt-in).
  - Сумма весов вне допустимого диапазона → Zod error с понятным сообщением.

<!-- Commit checkpoint 1: "feat(summarize): migration 006, chunk_contents summary columns, config schema" -->

### Phase 2: Summarizer module

#### T04 (id 4): [x] Summarizer interface + MockSummarizer + factory (depends on T03)
- Files (все **NEW**):
  - `src/summarize/types.ts` — `interface Summarizer { summarize(chunk): Promise<string | null> }`
  - `src/summarize/mock.ts` — детерминированный mock для тестов
  - `src/summarize/factory.ts` — выбор провайдера из конфига
  - `src/summarize/index.ts` — публичный export
- **DoD**:
  - `createSummarizer(config)` возвращает `MockSummarizer` если провайдер `mock`.
  - Типы не экспортируют `any`.
  - Unit-тесты T10 для factory и mock проходят.

#### T05 (id 5): [x] SiliconFlowSummarizer — OpenAI-compat chat (depends on T04, T06)
- Files:
  - `src/summarize/siliconflow.ts` (**NEW**)
- Pattern: следовать `src/embeddings/openai.ts` и `src/embeddings/siliconflow*`. Использовать общий `fetchWithRetry`, per-request isolation, 429-retry.
- **DoD**:
  - Реализован `Summarizer.summarize(chunk)` через chat-completions endpoint.
  - Retry на 429 с экспоненциальным backoff (используем существующий util).
  - Unit-тесты T10 с мок-fetch: happy path, 429-retry, timeout.
  - Ошибка провайдера → `null` + structured warning log (не падаем на весь batch).

#### T06 (id 6): [x] Prompt builder + skip gates (depends on T04)
- Files (все **NEW**):
  - `src/summarize/prompt.ts` — cached system prompt, `buildUserPrompt(chunk)`
  - `src/summarize/gates.ts` — `shouldSummarize(chunk): { skip: bool, reason?: string }`
- Gates:
  - Gate 1: `content.length < 200` → skip.
  - Gate 2: chunk.kind ∈ {TYPE, INTERFACE} && no docstring → skip.
- **DoD**:
  - `buildUserPrompt` включает `Path/Kind/fqn/---/content` в строго фиксированном формате.
  - `shouldSummarize` возвращает reason для logging.
  - Unit-тесты T10 для prompt и gates проходят (в т.ч. edge cases).

<!-- Commit checkpoint 2: "feat(summarize): SiliconFlowSummarizer with prompt and skip gates" -->

### Phase 3: CLI

#### T07 (id 7): [x] CLI `rag summarize` — backfill команда (depends on T01-T06)
- Files:
  - `src/commands/summarize-cmd.ts` (**NEW**)
  - `src/cli.ts` (**EDIT** — регистрация подкоманды)
  - `rag.config.yaml` (**EDIT** — опциональный пример использования)
- Options: `--source <name>`, `--config <path>`, `--limit <N>`, `--dry-run` (**обязательно печатает cost estimate и не шлёт запросы к провайдеру**).
- Idempotent resume: читает только `WHERE summary IS NULL`; повторный запуск безопасен.
- **Cost estimate в --dry-run**: вычисляет `skippedChunks` через gates и выводит `estimatedCost ≈ remaining × avgTokens × pricePerToken` + сравнение с KariPos benchmark ($0.30-0.70).
- **DoD**:
  - `rag summarize --dry-run --source karipos` печатает план без внешних API-запросов.
  - `rag summarize --source karipos --limit 50` обрабатывает ровно 50 чанков, exit 0.
  - Повторный запуск без `--limit` продолжает с последнего NULL.
  - Прогресс-лог (chunk i/N, skipped, failed).

<!-- Commit checkpoint 3: "feat(cli): rag summarize backfill command" -->

### Phase 4: Search 3-way RRF

#### T08 (id 8): [x] rrfFuse 3-way extension + ScoredChunk types (depends on T03)
- Files:
  - `src/search/hybrid.ts` (**EDIT**)
  - `src/search/types.ts` (**EDIT** — `source: 'bm25'|'vec'|'vec-summary'`)
- **DoD**:
  - Сигнатура `rrfFuse` принимает 2 или 3 списка.
  - Unit-тесты T12 проверяют дедупликацию и RRF-score для 3-way.

#### T09 (id 9): [x] SearchCoordinator — 3-way search + graceful fallback (depends on T02, T03, T08)
- Files:
  - `src/search/coordinator.ts` (**EDIT** — добавить `searchSummaryVector` как 3-й parallel query)
- Logic:
  - Если `config.search.useSummaryVector === true` и источник имеет хотя бы один non-NULL summary_embedding — выполняется 3-way.
  - Иначе graceful fallback на 2-way (BM25 + vec-content).
- **DoD**:
  - `searchBranchAware` и `searchLegacy` поддерживают опциональный 3-й parallel query.
  - Unit-тесты T12: (a) 3-way путь, (b) fallback при NULL-only источнике, (c) weighting корректный.

<!-- Commit checkpoint 4: "feat(search): 3-way RRF with summary embeddings" -->

### Phase 5: Tests

#### T10 (id 10): [x] Unit tests — Summarizer модуль (depends on T04-T06)
- Files (все **NEW**):
  - `src/summarize/__tests__/siliconflow.test.ts` — happy path + 429 + timeout с мок-fetch
  - `src/summarize/__tests__/prompt.test.ts` — формат строго Path/Kind/fqn/---/content
  - `src/summarize/__tests__/gates.test.ts` — edge cases (пустой content, короткий, TYPE без JSDoc)
  - `src/summarize/__tests__/factory.test.ts` — селектор провайдера
  - `src/summarize/__tests__/mock.test.ts` — детерминированность
- **DoD**:
  - `npm test -- src/summarize` зелёный.
  - Покрытие `src/summarize/` ≥ 80 %.

#### T11 (id 11): [x] Integration tests — ChunkContentStorage summary методы (depends on T01, T02)
- Files:
  - `src/storage/__tests__/chunk-contents.test.ts` (**EDIT** — дополнительные describe-блоки: `summary methods`, `searchSummaryVector`)
- **DoD**:
  - `npm test -- src/storage/__tests__/chunk-contents` зелёный на локальной БД.
  - Тесты пропускаются если БД недоступна (skip-check через env flag, как уже сделано в проекте).

#### T12 (id 12): [x] Unit tests — SearchCoordinator 3-way + rrfFuse (depends on T08, T09)
- Files:
  - `src/search/__tests__/coordinator.test.ts` (**EDIT** — файл уже существует, добавить describe-блоки для 3-way/fallback)
  - `src/search/__tests__/hybrid.test.ts` (**EDIT** — файл существует, расширить тестами rrfFuse для 3 списков)
- **DoD**:
  - `npm test -- src/search` зелёный.
  - Покрыты: (a) 3-way happy path, (b) graceful fallback, (c) RRF дедуп.

<!-- Commit checkpoint 5: "test(summarize): unit tests for summarizer, storage, and 3-way search" -->

### Phase 6: Pre-req + benchmark

#### T13 (id 13): [x] PRE-REQ — KariPos clean reindex + coverage validation
- Files:
  - `scripts/validate-coverage.ts` (**NEW**) — standalone script, `process.exit(1)` при coverage < threshold (default 95 %).
- Runtime steps (user-side, автоматизируется в `/aif-implement`):
  - `rag remove karipos`
  - `rag index --source karipos`
  - `tsx scripts/validate-coverage.ts --source karipos --min 95`
- **DoD**:
  - Скрипт логирует `indexedFiles/totalEligible` и `chunksWithEmbedding/totalChunks`.
  - Exit code 1 при провале хотя бы одного порога.
  - README снабжён инструкцией запуска.

#### T14 (id 14): [x] Benchmark golden set — initial seed + hard cases
- Files (все **NEW**):
  - `.ai-factory/benchmarks/summary-baseline.json`
  - `.ai-factory/benchmarks/README.md`
- Content:
  - Ручной seed (5-8 queries) + hard cases (3-5) + инструкция LLM-генерации до 30.
- **DoD**:
  - JSON валидный, схема `{ queries: { query, goldenFqns: string[], category: string }[] }`.
  - README описывает воспроизводимость (Claude session prompt + human review шаги).

#### T15 (id 15): [x] `scripts/bench-summary.ts` — benchmark runner (depends on T09, T13, T14)
- Files:
  - `scripts/bench-summary.ts` (**NEW**)
- Modes: 2-way (baseline, `useSummaryVector: false`) vs 3-way (treatment, `true`), одна БД, одинаковый rerank.
- Metrics: Recall@5, Recall@10, MRR, per-category breakdown.
- **DoD**:
  - `tsx scripts/bench-summary.ts` печатает таблицу результатов в stdout + опциональный `--json` флаг.
  - Скрипт читает `.ai-factory/benchmarks/summary-baseline.json`.
  - Exit 0 даже при ухудшении (merge-criterion — решение автора).

<!-- Commit checkpoint 6: "chore(bench): validate-coverage script, golden set, bench-summary runner" -->

### Phase 7: Documentation

#### T16 (id 16): [x] Documentation update (depends on T07, T09, T15)
- Files:
  - `README.md` (**EDIT** — раздел «AI-powered summarization» + пример CLI)
  - `CLAUDE.md` (**EDIT** — фразы по использованию 3-way search)
  - `rag.config.yaml` (**EDIT** — финальный пример с комментариями)
  - `docs/specs/ai-powered-summarization.md` (**NEW/REPLACE**)
  - `.ai-factory/ROADMAP.md` (**EDIT — отметить milestone ✔ после merge**)
- **DoD**:
  - В README есть таблица опций `rag summarize` и пример вывода.
  - Спека содержит: архитектура, format prompt, migration 006 (с rollback), benchmark методику.
  - ROADMAP.md — строка «AI-powered summarization» отмечена `[x]` + дата.

<!-- Commit checkpoint 7: "docs(summarize): README, CLAUDE.md, spec, config example" -->

---

## Dependency Graph (summary)

```
                  T01 ──► T02 ──► T11
                  │        │
                  │        ├──► T07 ──► T16
                  │        │    ▲
  T03 ──► T04 ──► T05 ──► ─┤    │
   │      │ └──► T06 ──► ──┘    │
   │      │                     │
   │      └──► T10              │
   │                            │
   └──► T08 ──► T09 ──► T12     │
                │               │
                └──► T15 ◄──────┘
                      ▲
              T13 ────┘
              T14 ────┘
```

ID map (dependency graph ↔ Tasks): T01…T16 в обеих таблицах используют один и тот же формат.
Критический путь: T03 → T04 → T06 → T05 → T07 → T09 → T15 → T16.

Параллелизуемые точки:
- **Start**: T01, T03, T14 — все три независимы, могут стартовать одновременно.
- **Phase 2**: T06 и T04→factory/mock параллельно T05 (после T04+T06).
- **Phase 5**: T10, T11, T12 полностью независимы — три параллельных потока.
- **Phase 6**: T13 (runtime-зависим от пользователя) и T14 (документный) параллельны.

## Risks / Gotchas

1. **Partial HNSW index** (`WHERE summary_embedding IS NOT NULL`) — обязателен, без него пустая таблица с NULL-векторами сломает HNSW.
   - *Mitigation*: в T01 тест вставки NULL строки + проверка `EXPLAIN ANALYZE` на 3-way search.
2. **Cost spike на KariPos** — 18K чанков × 200 tokens × Qwen2.5-7B = $0.30-$0.70.
   - *Mitigation*: `rag summarize --dry-run` обязателен перед первым прогоном; `--limit` для инкрементальных батчей.
3. **Rate limits SiliconFlow** — concurrency=4, retry на 429.
   - *Mitigation*: конфиг `summarization.concurrency`; при `RetryError` trunk logger + автодроп до 2.
4. **KariPos coverage блокер** — ~5% файлов сейчас.
   - *Mitigation*: T13 (validate-coverage) блокирует переход к benchmark, пока coverage < 95 %. При провале — смотреть ignore patterns и size-limits до того, как обвинять summary.
5. **Query-passage symmetry** — summary на английском, embedder тот же.
   - *Mitigation*: если в запросе русские слова — content-vec подхватит по русским комментариям; decision-rationale описан в спеке T16.
6. **Weights normalization при 3-way** — `bm25Weight + vectorWeight + summaryVectorWeight ≈ 1.0`.
   - *Mitigation*: Zod `.refine()` с допуском ±0.01 и user-friendly сообщением; unit-тест T12 подтверждает reject.
7. **Migration 006 rollback** — миграции системы `up-only`.
   - *Mitigation*: rollback-шаги задокументированы в T01 DoD и продублированы в `docs/specs/ai-powered-summarization.md` (T16). Pre-merge smoke test: `rag init` на копии prod-БД → rollback → `rag init` повторно.

## Out of scope v1

- BM25 tsvector по summary (`search_vector_summary`) → v2 после бенчмарка.
- Автоматическая проверка hallucinations → v1.5.
- Context enrichment промта (header_path / enclosing / neighbours) → v2.
- `rag index --summarize` → v2.
- MCP-параметр `useSummary` per-query → сейчас через config; добавим позже при запросе.

---

## Next steps

После review плана — `/aif-implement` начнёт с T01 (unblocked), T03 (unblocked) и T14 (unblocked). Параллельно: T01 разблокирует T02, T03 разблокирует T04+T08; T14 остаётся автономным. Критический путь завершается в T16 (documentation) после T15 (benchmark) и ROADMAP галочки.
