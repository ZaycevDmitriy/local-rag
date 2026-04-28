# Research

Updated: 2026-04-17 18:05
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic: Benchmark для AI-powered summarization (PR #11) даёт 0% Recall/MRR на всех запросах.

Goal: Восстановить работоспособность бенчмарка как regression guard для 2-way vs 3-way поиска.

Constraints:
- Бенчмарк `scripts/bench-summary.ts` опирается на `chunk.metadata.fqn` (`scripts/bench-summary.ts:112`).
- Summarization-фича (PR #11) уже merge-ready: 582 теста зелёные, 9/10 manual тестов прошли, `useSummaryVector` off-by-default.
- `.ai-factory/benchmarks/README.md` явно говорит "exit 0 не блокирует merge — решение автора".
- Переиндексация karipos допустима (embedding уже в `chunk_contents`, re-index быстрый).

Decisions:
- Root cause не в golden set и не в coverage — это **`metadata.fqn` не сохраняется в БД**. `src/indexer/indexer.ts:163` и `:228` кладут `metadata: {}` при insert (артефакт commit `29862cb` / migration 005 / branch-aware rewrite). Проверено: `SELECT COUNT(*) WHERE metadata ? 'fqn'` = 0 из 18712 karipos chunks.
- Стратегия merge — ACCEPT-AS-IS PR #11 + два отдельных PR:
  - PR-A `fix(indexer): persist metadata.fqn/fragmentType for code chunks` (size S): ~2 места по 4-6 строк + reindex + unit-тест. Миграция НЕ нужна — колонка `metadata jsonb` уже есть.
  - PR-B `bench(summarize): real golden set + full backfill` (size M): 10-30 реальных запросов, $0.10 backfill через `rag summarize --source karipos`.
- Метрика: для v1 golden set использовать **path+lineRange overlap**, не FQN — работает СЕЙЧАС без PR-A, индустриальный стандарт (CodeSearchNet/CoIR используют path-level matching). FQN-matching оставить как опциональное усиление.

Open questions:
- Для PR-A: стоит ли заодно удалить мёртвые индексы `idx_chunks_path`, `idx_chunks_source_type`, `idx_chunks_language` (миграции 003/004 — созданы под старую схему, где эти поля жили в jsonb; после 005 они по пустому jsonb → мёртвые)? Требует отдельной проверки `pg_stat_user_indexes`.
- Для PR-B: использовать 3A (LLM-gen запросов + поиск реальных FQN через grep/AST) или 3C (path-based без FQN)? 3C проще и не зависит от PR-A.
- LLM-judge preference (3D вариант) для "субъективной top-5 оценки" из README — nice-to-have, отложить до v2.

Success signals:
- PR-A: reindex karipos → `SELECT COUNT(*) WHERE metadata ? 'fqn'` > 0 для code chunks; unit-тест "indexer writes metadata.fqn".
- PR-B: `bench-summary --mode both` показывает non-zero Recall@5 на обеих ветках + дельта между treatment и baseline интерпретируется автором.

Next step:
- Сначала PR-A (blocker для FQN-based бенча). Если идём по пути path-based golden — PR-B и PR-A параллельны.
- Запустить `/aif-plan fast "fix indexer metadata persistence for fqn and fragmentType"`.
<!-- aif:active-summary:end -->

## Sessions
<!-- aif:sessions:start -->
### 2026-04-17 18:05 — Диагностика 0% Recall в bench-summary
What changed:
- Обнаружен root cause: `metadata: {}` захардкожен в `src/indexer/indexer.ts:163` (главный путь `indexView`) и `:228` (repair-ветка). Коммит `29862cb` "feat: implement snapshot indexing pipeline" (2026-04-04, migration 005).
- Проверено на проде: `SELECT jsonb_object_keys(metadata)` возвращает 0 строк для karipos (18712 chunks, все metadata = `{}`).
- Search coordinator уже ЧИТАЕТ `metadata.fqn` (`src/search/coordinator.ts:225, :380`), так что fix в indexer подхватится без изменений в read-path.
- ts-extractor и все остальные (java/kotlin) корректно строят `fqn` — не сохраняется только на этапе insert.
- Все 10 пунктов manual test plan из PR #11 отработали. Пункт 9 (bench 0%) — проявление этого бага, не дефект summarization.

Key notes:
- Фикс **не требует миграции schema** — колонка `metadata jsonb NOT NULL DEFAULT '{}'` уже есть.
- Переиндексация karipos дёшевая: embedding лежит в `chunk_contents` (дедуплицирован по content_hash), reindex пересоберёт только `chunks`-строки.
- Миграции 003 (`idx_chunks_path` GIN по `metadata->>'path'`) и 004 (idx по `sourceType`/`language` из metadata) после 005 стали мёртвыми — читают пустой jsonb. Не трогать без отдельного анализа.
- bench-summary.ts в текущем виде жёстко привязан к FQN (`extractFqn` в `scripts/bench-summary.ts:112`). Для path-based метрики потребуется дополнительный fix в скрипте — но это маленькое изменение.
- Golden set `.ai-factory/benchmarks/summary-baseline.json` содержит 9 запросов с placeholder-FQN (`auth.session.refresh`, `payment.checkout.initiate` и т.п.) — это seed, README планирует расширение до 30 через LLM-gen + human review.
- Summary coverage на момент бенча = 72/16401 (0.4%). Dry-run оценил полный backfill в $0.099 / 9868 LLM-вызовов / ~1-2 часа при concurrency=4.

Links (paths):
- `src/indexer/indexer.ts:163` — insert `metadata: {}` (главный путь)
- `src/indexer/indexer.ts:228` — insert `metadata: {}` (repair)
- `src/indexer/indexer.ts:462` — legacy-путь `indexSource`, здесь metadata сохраняется правильно (pre-branch-aware)
- `src/chunks/code/tree-sitter-chunker.ts:116` — chunker корректно строит `ChunkMetadata { fqn, fragmentType, ... }`
- `src/chunks/code/ts-extractor.ts:20,41,61,80,94,111` — FQN генерация для TS/JS
- `src/chunks/code/kotlin-extractor.ts:156,208,236,260,290` — FQN для Kotlin
- `src/search/coordinator.ts:225` — branch-aware read `metadata.fqn`
- `src/search/coordinator.ts:380` — legacy read `metadata.fqn`
- `scripts/bench-summary.ts:112` — `extractFqn(result) => result.coordinates.fqn`
- `.ai-factory/benchmarks/README.md` — merge criterion, план расширения golden
- `.ai-factory/benchmarks/summary-baseline.json` — текущий seed (9 запросов)
- commit `29862cb` — источник регрессии (branch-aware rewrite)

### 2026-04-28 — Dead-index audit для chunks после bench-summary
What changed:
- Выполнен безопасный pre/post snapshot `pg_stat_user_indexes` без `pg_stat_reset()` и без удаления индексов.
- Между snapshot был запущен `npx tsx scripts/bench-summary.ts --mode both`.

Results:
- `idx_chunks_path`: `idx_scan` `28 -> 28`, delta `0`.
- `idx_chunks_source_type`: индекс отсутствует в текущей БД.
- `idx_chunks_language`: индекс отсутствует в текущей БД.

Artifacts:
- `.ai-factory/benchmarks/dead-index-before-2026-04-28.json`
- `.ai-factory/benchmarks/dead-index-after-2026-04-28.json`
- `.ai-factory/benchmarks/bench-result-2026-04-28-index-audit.txt`

Recommendation:
- В текущей локальной БД нет `idx_chunks_source_type` / `idx_chunks_language`, поэтому удалять нечего.
- `idx_chunks_path` не использовался во время bench-summary (`delta=0`). Не удалять в рамках текущего плана; если индекс есть в общей миграционной истории, оформить отдельный audit/cleanup PR с проверкой на других search-path сценариях.
<!-- aif:sessions:end -->
