# Plan: Восстановление bench-summary (PR-A + PR-B)

**Branch:** `feature/bench-summary-restore`
**Base branch:** `main`
**Created:** 2026-04-23
**Last refined:** 2026-04-23 (via `/aif-improve`)
**Source:** `.ai-factory/RESEARCH.md` (Active Summary 2026-04-17 18:05)

## Settings
- **Testing:** yes — unit + regression тесты обязательны (RULES.md строчка о regression-тестах для indexer/search).
- **Logging:** verbose — DEBUG-логи для indexer-пути и bench-скрипта.
- **Docs:** yes — обновить `.ai-factory/benchmarks/README.md` и, при необходимости, `docs/configuration.md`.
- **Roadmap linkage:** skip. Rationale: regression fix + расширение benchmark-гарда, не самостоятельный milestone из `ROADMAP.md`.

## Research Context (from RESEARCH.md Active Summary)

**Topic:** Benchmark для AI-powered summarization (PR #11) даёт 0% Recall/MRR на всех запросах.

**Goal:** Восстановить работоспособность бенчмарка как regression guard для 2-way vs 3-way поиска.

**Root cause (подтверждён на проде):** `metadata: {}` захардкожен при insert в `src/indexer/indexer.ts:163` (главный путь) и `:228` (repair-ветка). На karipos 0 из 18712 chunks имеют `metadata ? 'fqn'`. Регрессия от commit `29862cb` (branch-aware rewrite, migration 005). Chunker (`tree-sitter-chunker.ts:116`) и все extractor'ы (`ts/java/kotlin`) корректно строят `ChunkMetadata { fqn, fragmentType, ... }` — теряется только на уровне indexer'а.

**Constraints:**
- Колонка `chunks.metadata jsonb NOT NULL DEFAULT '{}'` уже есть — миграция не нужна.
- Search coordinator уже читает `metadata.fqn` (`src/search/coordinator.ts:225, :380`) — read-path не трогаем.
- Переиндексация karipos дёшёвая (embeddings в `chunk_contents` дедуплицированы).
- Full summary backfill: ~$0.10 / 9868 LLM-вызовов / 1–2 часа при `concurrency=4`.
- `ChunkStorage.insertBatch` (`src/storage/chunks.ts:77`) уже сериализует `metadata ?? {}` в jsonb через `JSON.stringify` — поддержка на стороне storage готова.
- Golden set `.ai-factory/benchmarks/summary-baseline.json` содержит 9 placeholder-FQN. README предполагает расширение до 30 реальных запросов.
- `package.json` **не содержит** алиаса `bench:summary`; существующий README зовёт `npx tsx scripts/bench-summary.ts`. Используем `npx tsx` во всех командах плана.
- Перед bench-прогоном по README обязательно `npx tsx scripts/validate-coverage.ts --source karipos --min 95` (embedding coverage). `validate-coverage.ts` **не валидирует summary coverage** — для неё отдельный inline SQL-check в Task 10.
- `rag.config.yaml` должен содержать раскомментированный блок `summarization:` и `sources[name=karipos].summarize: true` (см. Task 8b). Без этого `src/commands/summarize-cmd.ts:52-58` завершается с exit 1, и Task 9 не стартует.
- В тестовых файлах конвенция — суффикс `.test.ts` (11 файлов в `src/storage/__tests__/` + `src/indexer/__tests__/`), **не** `.spec.ts`.

**Strategy:** два коммита-PR в рамках одной ветки.
- **PR-A** `fix(indexer): persist metadata.fqn/fragmentType for code chunks` — Phase 1.
- **PR-B** `bench(summarize): path+lineRange metric, real golden set, full backfill` — Phase 2.

**Open questions (из RESEARCH.md):**
- Удалять ли мёртвые индексы `idx_chunks_path/source_type/language` (миграции 003/004 после 005) — вынесено в Phase 3 как аналитическая задача без удаления.
- 3A (LLM-gen + AST-grep для FQN) vs 3C (path-based без FQN) — выбираем **3C (path+lineRange)** как основную метрику, FQN оставляем опциональным бонусом. Метрика работает без зависимости от PR-A и совместима с индустриальными практиками (CodeSearchNet, CoIR).

## Success Signals
- `SELECT COUNT(*) FROM chunks WHERE metadata ? 'fqn'` > 0 после reindex karipos (для code-файлов).
- Новый unit-тест "indexer writes metadata.fqn/fragmentType for code chunks" зелёный.
- `npm run typesCheck && npm run lint && npm test` зелёные (RULES.md gate).
- `npx tsx scripts/bench-summary.ts --mode both` на расширенном golden set показывает **non-zero Recall@5** на baseline (2-way) И treatment (3-way) ветках, вывод интерпретируем в benchmark-note.

## Progress
- [x] Task 0 — Разобраться с uncommitted diff `scripts/bench/branch-aware-search.ts`
- [x] Task 1 — Проверить, что `ChunkStorage.insertBatch` не теряет поля `metadata`
- [x] Task 2 — Исправить главный путь `indexView` (src/indexer/indexer.ts:163)
- [x] Task 3 — Исправить repair-ветку (src/indexer/indexer.ts:228)
- [x] Task 4 — Unit-тесты: helper + regression на indexer
- [x] Task 5 — Regression: убедиться, что существующие тесты зелёные
- [x] Task 6 — Reindex karipos и верификация БД
- [x] Task 7 — Перевести bench-summary на метрику "path + lineRange overlap" (breaking schema)
- [x] Task 7a — Regression-тесты для bench-summary v2 matcher/loader
- [x] Task 8 — Расширить golden set до 20 реальных запросов (минимум 15) + bump version
- [x] Task 8a — Синхронизировать `benchmarks/README.md` с новой схемой
- [x] Task 8b — Включить summarize для karipos в `rag.config.yaml` (блокер Task 9)
- [x] Task 9a — Canary backfill (--limit 200)
- [x] Task 9b — Full summary backfill
- [x] Task 10 — Прогон bench-summary и фиксация результатов
- [x] Task 11 — Анализ мёртвых индексов 003/004 (без удаления)

## Tasks

### Phase 0 — Housekeeping (pre-work)

#### Task 0 — Разобраться с uncommitted diff `scripts/bench/branch-aware-search.ts`
**Deliverable:** до старта Task 1 решить судьбу модификации в `scripts/bench/branch-aware-search.ts` (строка 214: `"BM25+prefix 'function'"` → `'BM25+prefix \'function\''`). Не входит в PR-A/PR-B scope, но уедет в ветку при `git add -A`.
**Важно:** не откатывать файл автоматически. Это uncommitted изменение в рабочем дереве; перед любым откатом нужно явно показать diff и получить подтверждение владельца изменения.
**Вариант A (безопасный по умолчанию):** оставить файл вне staged set для PR-A/PR-B и коммитить только явно перечисленные файлы (`git add <path> ...`). Подходит, если правка чужая или не относится к bench-summary.
**Вариант B:** закоммитить отдельным `chore(bench): normalize string quoting` ДО Commit Checkpoint 1, чтобы не смешивать со смысловым `fix(indexer)`.
**Вариант C:** откатить правку только после явного подтверждения пользователя; использовать отдельную команду отката, не как часть автоматического `/aif-implement`.
**Files:** `scripts/bench/branch-aware-search.ts` (только если выбран B).
**Logging:** n/a.
**Dependencies:** нет. Блокирует Commit Checkpoint 1 (чтобы тот не захватил чужую правку случайно).

---

### Phase 1 — PR-A: Indexer metadata persistence

#### Task 1 — Проверить, что `ChunkStorage.insertBatch` не теряет поля `metadata`
**Deliverable:** regression unit-тест, что `src/storage/chunks.ts:77` корректно сериализует произвольные ключи (`fqn`, `fragmentType`, `fragmentSubtype`, `receiverType`, `headerLevel`, `startOffset`, `endOffset`, `pageStart`, `pageEnd`) в колонку `metadata`.
**Files:** `src/storage/chunks.ts:7-86`, `src/storage/__tests__/chunks.test.ts` (новый файл; конвенция проекта — `.test.ts`, не `.spec.ts`).
**Test details:** следовать mock-SQL паттерну из `src/storage/__tests__/chunk-contents.test.ts`: замокать `sql.begin`, захватить `tx.unsafe` params и проверить, что 11-й параметр каждой occurrence-row — JSON-строка с ожидаемыми metadata-ключами и значениями. Real PG/testcontainer для этого проекта не используется и не нужен.
**Logging:** не добавлять новый `console.log` в `src/storage/chunks.ts`. Файл shared CLI+MCP; stdout-дисциплина уже защищается `src/mcp/__tests__/stdout-discipline.test.ts`. Если диагностика всё же нужна — только `console.error`, но для этой задачи логирование не требуется.
**Notes:** никакой правки логики — только unit-тест serialization contract, чтобы последующее изменение indexer не сломалось при будущих рефакторингах storage.

#### Task 2 — Исправить главный путь `indexView` (src/indexer/indexer.ts:163)
**Deliverable:** в главном цикле (`for (const [path, chunks] of occurrencesByFile)`) вместо `metadata: {}` передавать `metadata` с «extra»-полями чанка (`fqn`, `fragmentType`, `fragmentSubtype`, `receiverType`, `headerLevel`, `startOffset`, `endOffset`, `pageStart`, `pageEnd`). Поля, уже представленные отдельными колонками (`path`, `sourceType`, `startLine`, `endLine`, `headerPath`, `language`), дублировать НЕ нужно, чтобы не раздувать jsonb.
**Files:**
- `src/indexer/indexer.ts:143-166` (call-site).
- `src/indexer/_helpers/metadata.ts` (new): экспортирует `buildChunkMetadataJson(metadata: ChunkMetadata): Record<string, unknown>` — собирает только «extra»-поля, пропускает `undefined`.
**Implementation:**
- Helper — internal submodule indexer'а (по аналогии с `src/commands/_helpers/*`). Barrel `index.ts` в `_helpers/` **не нужен** — импортируем прямым относительным путём.
- Сигнатура: `export function buildChunkMetadataJson(metadata: ChunkMetadata): Record<string, unknown>`.
- Использовать helper в цикле вставки вместо литерала `{}`.
**Logging:** DEBUG `[Indexer.indexView] built metadata for ${path}: keys=${keys.join(',')}` (CLI-only путь, console.log в стиле существующих логов indexer'а).
**Dependencies:** Task 1.

#### Task 3 — Исправить repair-ветку (src/indexer/indexer.ts:228)
**Deliverable:** аналогичная правка в ветке repair (`repairOccurrences.push(...)`). Обязательно использовать тот же helper `buildChunkMetadataJson` из Task 2, чтобы не допустить дрейф логики (skill-context: single helper for dry-run + real path — здесь main + repair).
**Files:** `src/indexer/indexer.ts:212-230`.
**Logging:** DEBUG `[Indexer.indexView] repair built metadata for ${path}: keys=${keys.join(',')}`.
**Dependencies:** Task 2.

#### Task 4 — Unit-тесты: helper + regression на indexer
**Deliverable:** два теста.
1. `src/indexer/__tests__/build-chunk-metadata.test.ts` (new) — чистый unit-тест helper'а из Task 2: проверить, что полный `ChunkMetadata` с `fqn='com.example.Foo.bar'` / `fragmentType='method'` / `fragmentSubtype='DATA_CLASS'` / `receiverType='String'` даёт на выходе объект ровно с этими ключами, без дубликатов `path/sourceType/startLine/endLine/headerPath/language`, а `undefined`-поля опускаются.
2. `src/indexer/__tests__/indexer-metadata.test.ts` (new) — regression-тест `indexView` в текущем mock-style проекта, по образцу `src/indexer/__tests__/indexer-repair.test.ts` и `src/indexer/__tests__/indexer-embeddings.test.ts`. Мокируется storage-граф и `ChunkDispatcher`, возвращающий фикстурные `Chunk[]` с `metadata.fqn`/`fragmentType`. Проверка — аргументы `chunkStorage.insertBatch` в main path содержат occurrence с `metadata.fqn` и `metadata.fragmentType`; repair-ветка аналогично проверяется через `getChunklessFiles` + `fileBlobStorage.getByHash`. Real PG/testcontainer не добавлять: такой инфраструктуры и зависимости в проекте нет.
**Files:** два новых test-файла в `src/indexer/__tests__/` + storage test из Task 1.
**Logging:** spy на console.log для проверки `built metadata` сообщения (опционально).
**Dependencies:** Task 2, Task 3.

#### Task 5 — Regression: убедиться, что существующие тесты зелёные
**Deliverable:** запуск `npm run typesCheck`, `npm run lint`, `npm test`; все зелёные (582 теста + новые). При падении — чинить, не ослаблять тесты.
**Files:** n/a (gate).
**Logging:** n/a.
**Dependencies:** Task 4.

#### Task 6 — Reindex karipos и верификация БД
**Deliverable:** выполнить `rag index karipos` (positional argument, см. `src/commands/index-cmd.ts:29,99-107`) или `rag index --all`. **Важно:** опции `--source` у CLI `index` нет — команда `rag index --source karipos` упадёт. Затем проверить:
```sql
SELECT COUNT(*) FROM chunks c
  JOIN source_views sv ON sv.id = c.source_view_id
  JOIN sources s ON s.id = sv.source_id
  WHERE s.name = 'karipos' AND c.metadata ? 'fqn';
```
Ожидается > 0 (для code-файлов TS/JS/Java/Kotlin). Записать фактическое число в `.ai-factory/benchmarks/README.md` как baseline coverage.
**Files:** `.ai-factory/benchmarks/README.md` (заметка о coverage).
**Logging:** зафиксировать stdout-прогресс indexer, сохранить в `.ai-factory/benchmarks/reindex-log-<date>.md` (опционально).
**Dependencies:** Task 5.

**Commit Checkpoint 1** — после Task 4–5 (до reindex):
```
fix(indexer): persist metadata.fqn/fragmentType for code chunks

- indexer.indexView main path and repair branch now write metadata
  via shared buildChunkMetadataJson helper instead of `metadata: {}`
- add unit test for helper + regression test for indexer pipeline
- closes PR-A from .ai-factory/RESEARCH.md
```
Task 6 — не коммит кода, а операционная проверка (результаты приложить к PR как комментарий).

---

### Phase 2 — PR-B: Real benchmark

> **Параллельность:** Task 9 (backfill, 1–2 часа) **не зависит** от Phase 1 — summary пишется в `chunk_contents` и не требует `metadata.fqn` в `chunks`. Рекомендуется запустить его в параллельном терминале сразу после завершения Task 8, пока идёт Task 6 (reindex). Только Task 10 требует, чтобы и Phase 1, и Task 9 уже завершились.

#### Task 7 — Перевести bench-summary на метрику "path + lineRange overlap" (breaking schema)
**Deliverable:** переписать `scripts/bench-summary.ts` под новый формат golden set. Конкретно:
1. Заменить TS-интерфейс `BaselineQuery` (сейчас `:36-41`):
   ```ts
   interface BaselineExpectation {
     path: string;           // нормализованный относительный путь от repo root
     startLine: number;
     endLine: number;
     fqn?: string;           // опциональный бонус, не required
   }
   interface BaselineQuery {
     query: string;
     expected: BaselineExpectation[];  // 1-3 релевантных чанка
     category: string;
     difficulty?: string;
     seedKind?: string;
   }
   ```
2. Добавить в функцию `loadBaseline` (`:101-108`) проверку `parsed.version === 2` (`throw` при v1 с сообщением "golden set v1 deprecated, regenerate per README") и минимальную runtime-валидацию v2 JSON без новой зависимости:
   - `source` — non-empty string.
   - `queries` — non-empty array.
   - у каждой query есть `query`, `category`, `expected`.
   - `expected` — non-empty array (1–3 ожидаемых чанка); у каждого элемента `path` — non-empty string, `startLine`/`endLine` — finite positive integers, `startLine <= endLine`, `fqn` если есть — string.
   - ошибка должна содержать индекс query/expected, чтобы быстро чинить golden set.
3. Удалить `extractFqn` (`:112-114`) и заменить на:
   ```ts
   function matchByPathAndLineRange(expected: BaselineExpectation, candidate: SearchResult): boolean {
     if (normalizePath(expected.path) !== normalizePath(candidate.path)) return false;
     const s = candidate.coordinates.startLine ?? -Infinity;
     const e = candidate.coordinates.endLine ?? Infinity;
     return !(e < expected.startLine || s > expected.endLine); // любое пересечение
   }
   ```
   Добавить `normalizePath(p: string): string` — приводит разделители к `/`, отрезает ведущие `./`.
4. Переписать `evaluateQuery` (`:118-145`): вместо `Set(goldenFqns)` итерировать по `response.results` и искать первый hit через `q.expected.some((ex) => matchByPathAndLineRange(ex, result))`. `candidate.path` берётся с верхнего уровня `SearchResult` (подтверждено в `src/search/types.ts:72`), а `startLine/endLine` — из `candidate.coordinates`.
5. **Удалить `extractFqn` в этом PR полностью** (сейчас). Если позже решим реализовать fqn-бонус — воссоздадим из `candidate.coordinates.fqn` (тип сохранён в `src/search/types.ts:52`). Оставить только TODO-комментарий `// TODO: optional fqn-bonus counter (follow-up PR, read candidate.coordinates.fqn)`. Сам бонус в рамках этого PR **не реализуем** (scope-контроль, minimal viable).
**Files:** `scripts/bench-summary.ts` (значительная правка секций `:36-114`, `:118-145`).
**Logging:** DEBUG `[bench] match path=${path} lines=${s}-${e} expected=${ex.startLine}-${ex.endLine} -> ${matched}`.
**Dependencies:** Phase 1 не требуется — задача независима от PR-A.

#### Task 7a — Regression-тесты для bench-summary v2 matcher/loader
**Deliverable:** добавить тесты на новую benchmark-метрику и schema guard.
**Implementation options:**
- Предпочтительно вынести pure helpers (`normalizePath`, `matchByPathAndLineRange`, `validateBaselineFile`) в небольшой testable module рядом со скриптом, например `scripts/bench-summary-helpers.ts`, а `scripts/bench-summary.ts` оставить CLI-обёрткой.
- Альтернатива — экспортировать helpers из `scripts/bench-summary.ts` с guard'ом main-run, если это не ломает CLI execution.
**Test cases:**
- path normalization: `./src\\foo.ts` == `src/foo.ts`.
- line overlap: пересечение диапазонов даёт hit; соседние непересекающиеся диапазоны не дают hit.
- missing `expected`, пустой `expected`, v1 `goldenFqns`, строковые line numbers и `startLine > endLine` падают с понятной ошибкой.
- valid v2 baseline проходит.
**Files:** `scripts/bench-summary.ts`, optional helper module, `scripts/__tests__/bench-summary.test.ts` или ближайшая существующая test-директория по проектному паттерну.
**Dependencies:** Task 7.

#### Task 8 — Расширить golden set до 20 реальных запросов (минимум 15) + bump version
**Deliverable:** переписать `.ai-factory/benchmarks/summary-baseline.json` под v2:
- `"version": 2` (bump с `1`).
- Каждый элемент `queries[]` соответствует новому `BaselineQuery` (см. Task 7).
- **Target: 20 запросов (5 категорий × 4, минимум 15).** Распределение по категориям: авторизация, оплата, синхронизация заказов, печать чеков, навигация/UI. Конкретное число внутри диапазона выбирает implementer — 20 даёт комфортную статистику (Recall@5 с шагом 5%), <15 даёт слишком шумные метрики.
- Реальные вопросы по karipos (не придумывать FQN/path — брать из кода через Grep/Read).
- `fqn` в `expected[]` — заполнить только там, где FQN стабилен и известен (Kotlin/Java классы/функции).
**Migration strategy:** старые 9 placeholder-FQN записей **discard** (перезаписываем файл целиком). Это breaking change — зафиксировать в README changelog (см. Task 8a). Локальные форки golden set (если кто-то сохранил) придётся мигрировать вручную; по нашему инвентарю таких нет.
**Files:** `.ai-factory/benchmarks/summary-baseline.json` (полный replace).
**Logging:** n/a (данные).
**Dependencies:** Task 7 (формат expected[] должен совпадать с тем, что читает скрипт).

#### Task 8a — Синхронизировать `benchmarks/README.md` с новой схемой
**Deliverable:** обновить `.ai-factory/benchmarks/README.md`:
- Секция "Схема `summary-baseline.json`" (`:12-25`): новая TS-схема `Baseline { version: 2, queries: Array<{ query, expected: [{path, startLine, endLine, fqn?}], category, difficulty?, seedKind? }> }`.
- Секция hit definition (`:27`): "Запрос считается «hit», если хотя бы один из `expected[]` совпадает с результатом по `path` + пересечению `[startLine..endLine]`. FQN-match — опциональный бонус, не required."
- Добавить секцию `## Changelog`: "v2 (2026-04-23): replaced `goldenFqns: string[]` with `expected: [{path, startLine, endLine, fqn?}]`. Rationale: FQN metadata не сохранялся в БД (PR-A fix), plus path-based matching — индустриальный стандарт."
- Секция "Запуск benchmark" (`:41-57`): убрать ссылку на отсутствующий `npm run bench:summary`, оставить только `npx tsx scripts/bench-summary.ts …`. Добавить подпункт: перед прогоном обязательно `npx tsx scripts/validate-coverage.ts --source karipos --min 95`.
**Files:** `.ai-factory/benchmarks/README.md`.
**Logging:** n/a.
**Dependencies:** Task 7, Task 8 (читатель README должен видеть консистентную картину).

#### Task 8b — Включить summarize для karipos в `rag.config.yaml` (блокер Task 9)
**Deliverable:** единственный строгий блокер — `sources[name=karipos].summarize: true`. Без него `rag summarize` завершается с exit 1 (см. `src/commands/summarize-cmd.ts:52-58`).
Изменения в `rag.config.yaml`:
1. **ОБЯЗАТЕЛЬНО:** Добавить в запись `- name: karipos` (строки 69–107) поле `summarize: true` (рядом с `path`, `include`, `exclude`).
2. **РЕКОМЕНДУЕТСЯ (не блокер):** раскомментировать блок `summarization:` (`:38-44`) для документации дефолтов:
   ```yaml
   summarization:
     provider: siliconflow
     model: Qwen/Qwen2.5-7B-Instruct
     concurrency: 4
     timeoutMs: 60000
     cost:
       dryRunRequired: true
   ```
   **Почему не блокер:** Zod-схема (`src/config/schema.ts:190-200, 133-137`) задаёт полные дефолты на все поля (`provider: siliconflow`, `model: Qwen/Qwen2.5-7B-Instruct`, `concurrency: 4`, `timeoutMs: 60000`, `cost.dryRunRequired: true`, `avgTokensPerChunk: 200`, `pricePerTokenUsd: 0.05/1M`). Без раскомментирования `rag summarize` работает на дефолтах.
3. **API key:** отдельный `SILICONFLOW_API_KEY` для summarization экспортировать НЕ требуется — `src/summarize/factory.ts:20` делает fallback на `embeddings.siliconflow.apiKey`, который в `rag.config.yaml:11` уже связан с `${SILICONFLOW_API_KEY}`. Sanity-check перед запуском Task 9: `printenv SILICONFLOW_API_KEY` (не использовать `env | grep ...`, AGENTS.md запрещает pipe/комбинированные shell-команды).
4. **Валидация:** прогнать `rag summarize --source karipos --dry-run`. Ожидается non-zero cost estimate (dryRun печатает план без LLM-вызовов). Если Zod-схема конфига падает — фиксить схему/дефолты (`src/config/schema.ts`, `src/config/defaults.ts`) вместе с `docs/configuration.md` и тестами конфигурации (см. RULES.md про conf-schema sync).
**Files:** `rag.config.yaml` (1 обязательная правка + 1 опциональная); потенциально — `src/config/schema.ts`, `src/config/defaults.ts`, `docs/configuration.md`, `src/config/__tests__/*.test.ts` если Zod упрётся.
**Logging:** n/a (config).
**Dependencies:** нет (задача на конфиг, может идти параллельно с Phase 1).

#### Task 9a — Canary backfill (--limit 200)
**Deliverable:** smoke-test провайдерской логики перед полным прогоном. Команды:
```bash
rag summarize --source karipos --dry-run                    # свежая оценка стоимости
rag summarize --source karipos --limit 200                  # canary
```
**Success check:** 200 уникальных `chunk_contents` обработаны без fatal-ошибок провайдера; coverage `summary IS NOT NULL` увеличился на ~200 (с учётом skip-gates — см. `src/summarize/` логику). При ошибках (>5% failed) — не запускать Task 9b, разбираться.
**Files:** n/a. Результат — +~200 summarized rows в `chunk_contents`.
**Logging:** CLI stdout, сохранить фрагмент в `.ai-factory/benchmarks/backfill-log-<date>.md`.
**Dependencies:** Task 8b.

#### Task 9b — Full summary backfill
**Deliverable:** после зелёной Task 9a снять лимит: `rag summarize --source karipos` (дефолтный `concurrency=4`). Ожидание: ~$0.10, ~9868 вызовов (минус уже обработанные 200 из 9a), 1–2 часа.
**Files:** n/a (операция на проде-БД). Результат — покрытие `summary IS NOT NULL` по уникальным `chunk_contents.content_hash` выросло с 0.4% до >90%.
**Logging:** verbose CLI-лог суммаризатора; добавить итоговый отчёт в `.ai-factory/benchmarks/backfill-log-<date>.md` (продолжение лога 9a).
**Dependencies:** Task 9a, Task 8 (нужен финальный формат golden для Task 10; сам backfill независим от Phase 1 / Task 6).

#### Task 10 — Прогон bench-summary и фиксация результатов
**Deliverable:**
1. **Pre-flight embedding coverage** (проверяет, что reindex karipos прошёл до конца):
   ```bash
   npx tsx scripts/validate-coverage.ts --source karipos --min 95
   ```
   Если coverage ниже порога — вернуться к reindex (Task 6).
2. **Pre-flight summary coverage** (`validate-coverage.ts` её не проверяет — см. `scripts/validate-coverage.ts:79-88`). Выполнить SQL напрямую:
   ```sql
   SELECT
     COUNT(DISTINCT cc.content_hash)::int AS total,
     COUNT(DISTINCT cc.content_hash) FILTER (WHERE cc.summary IS NOT NULL)::int AS with_summary,
     COUNT(DISTINCT cc.content_hash) FILTER (WHERE cc.summary_embedding IS NOT NULL)::int AS with_summary_emb
   FROM chunk_contents cc
   JOIN chunks c ON c.chunk_content_hash = cc.content_hash
   JOIN indexed_files f ON c.indexed_file_id = f.id
   JOIN source_views sv ON f.source_view_id = sv.id
   JOIN sources s ON sv.source_id = s.id
   WHERE s.name = 'karipos';
   ```
   Порог: `with_summary_emb / total ≥ 0.90`. Если меньше — вернуться в Task 9 и догнать backfill. Фактические числа (`total`, `with_summary`, `with_summary_emb`) записать в результирующий MD рядом с Recall-метриками — без них дельту 2-way vs 3-way нельзя интерпретировать (если summary coverage низкий, treatment мягко даунгрейдится до 2-way).
   Важно: считать `DISTINCT cc.content_hash`, потому что `rag summarize` работает по уникальным `chunk_contents`, а join с `chunks` размножает occurrence rows.
3. **Прогон bench:**
   ```bash
   npx tsx scripts/bench-summary.ts --mode both --json > .ai-factory/benchmarks/bench-result-<date>.json
   npx tsx scripts/bench-summary.ts --mode both   # человекочитаемый вывод
   ```
   Для усреднения прогнать 3 раза вручную (`--runs` в скрипте не реализован и не планируется в этом PR). Усреднить Recall@5 / Recall@10 / MRR руками или через простой `jq`-one-liner. Если захочется `--runs` — отдельный PR в будущем.
4. **Фиксация:** записать abs-цифры baseline vs treatment + delta + summary coverage из шага 2 в `.ai-factory/benchmarks/summary-baseline-results-<date>.md`; короткая интерпретация автора: идёт ли 3-way в плюс/минус, на каких категориях запросов.
**Success check:** non-zero Recall@5 И на baseline (2-way), И на treatment (3-way). Если baseline = 0 — проблема НЕ в summarization, а в indexer (Phase 1 не отработал) или в golden set (Task 8). Если baseline > 0, а treatment ≈ baseline — проверить summary coverage из шага 2 (низкое покрытие → мягкий даунгрейд до 2-way в `SearchCoordinator`).
**Files:** `.ai-factory/benchmarks/summary-baseline-results-<date>.md` (new), `.ai-factory/benchmarks/bench-result-<date>.json` (new), ссылка из README.
**Logging:** stdout bench-скрипта + `bench-result-<date>.json` сохранить как артефакт.
**Dependencies:** Task 6 (reindex завершён → fqn в БД), Task 8 (golden v2 готов), Task 8a (README консистентен — страхует от путаницы), Task 8b (summarize-конфиг включён), Task 9b (полный backfill завершён → summary в БД).

**Commit Checkpoint 2** — после Task 7, 7a, 8, 8a, 8b:
```
bench(summarize): path+lineRange metric, golden set v2, enable summarize-config

- switch bench-summary.ts primary metric from FQN-equality to
  path+lineRange overlap (industry standard: CodeSearchNet/CoIR)
- replace BaselineQuery schema: goldenFqns[] -> expected[{path,startLine,endLine,fqn?}]
- bump summary-baseline.json version 1 -> 2
- expand golden set from 9 placeholder queries to N real karipos queries
- sync .ai-factory/benchmarks/README.md schema + changelog + run commands
- enable summarization: in rag.config.yaml + summarize:true for karipos
  (prereq for rag summarize --source karipos, Task 9)
```

**Commit Checkpoint 3** — после Task 9a, 9b, 10:
```
bench(summarize): full karipos backfill + baseline results

- attach summary-baseline-results-<date>.md with 2-way vs 3-way delta
- document backfill run (cost, duration, coverage) in benchmark README
- include canary (200-chunk smoke-test) log alongside full backfill
```

---

### Phase 3 — Housekeeping (open question из RESEARCH.md)

#### Task 11 — Анализ мёртвых индексов 003/004 (без удаления)
**Deliverable:** измерить фактическое использование индексов `idx_chunks_path`, `idx_chunks_source_type`, `idx_chunks_language`.
**Важно:** `pg_stat_user_indexes.idx_scan` — кумулятивный счётчик с момента последнего `pg_stat_reset()` или рестарта PG. «0 scans за всю историю» и «0 scans во время bench» — разные сигналы.
Две допустимые методики (выбрать одну):
- **A (предпочтительно, локально-безопасно):** зафиксировать baseline ДО Task 10:
  ```sql
  CREATE TEMP TABLE idx_baseline AS SELECT indexrelname, idx_scan
    FROM pg_stat_user_indexes
    WHERE indexrelname IN ('idx_chunks_path','idx_chunks_source_type','idx_chunks_language');
  ```
  После Task 10 — diff:
  ```sql
  SELECT s.indexrelname, s.idx_scan - b.idx_scan AS delta_scans
    FROM pg_stat_user_indexes s JOIN idx_baseline b USING (indexrelname);
  ```
- **B (проще, но влияет на весь сервер):** `SELECT pg_stat_reset();` перед Task 10, затем прямое чтение `idx_scan`. Только на dev-БД.
Если delta = 0 по всем трём индексам — задокументировать в `.ai-factory/RESEARCH.md` (new session entry) с рекомендацией отдельной миграцией 007 удалить. В рамках этого плана **не удалять** — scope creep, отдельный PR.
**Files:** `.ai-factory/RESEARCH.md` (append session).
**Logging:** n/a.
**Dependencies:** Task 10 (нужен свежий bench-трафик на индексы) + baseline snapshot ДО Task 10 (методика A).

## Commit Plan

| # | Tasks | Commit message | Notes |
|---|-------|----------------|-------|
| 0 | 0 | `chore(bench): normalize string quoting` (опционально) | Только если выбран вариант B в Task 0; при варианте A файл просто не добавляется в staged set. |
| 1 | 1–5 | `fix(indexer): persist metadata.fqn/fragmentType for code chunks` | После зелёных quality gates. Task 6 — операционная проверка, коммита не требует. |
| 2 | 7, 7a, 8, 8a, 8b | `bench(summarize): path+lineRange metric, golden set v2, enable summarize-config` | Скрипт + тесты + JSON v2 + README + rag.config.yaml синхронно. 8b — блокер для Task 9a/9b. |
| 3 | 9a, 9b, 10 | `bench(summarize): full karipos backfill + baseline results` | Коммитятся артефакты benchmark-run + обновление README. Canary 9a — предохранитель, не отдельный коммит. |
| 4 | 11 | `docs(research): dead-indexes audit 003/004` | Опционально — только если Task 11 выявил delta `idx_scan=0` за время bench. |

## Next Steps
1. Запустить `/aif-implement` в этой ветке.
2. Task 0 — решить судьбу uncommitted diff в `scripts/bench/branch-aware-search.ts` до старта Task 1: по умолчанию не добавлять в staged set; откатывать только после явного подтверждения пользователя.
3. Начать с Phase 1 (блокирующая для Task 10). Task 8b (config-правка) — дешёвая, можно сделать сразу и в параллель с Phase 1, затем Task 7/7a/8/8a.
4. **Параллельно** после Task 8b запустить Task 9a (canary `--limit 200`, ~минуты), затем Task 9b (`rag summarize --source karipos` без лимита) в отдельном терминале — экономит 1–2 часа wall-time, backfill не зависит от `metadata.fqn`.
5. Перед Task 10 — зафиксировать `idx_baseline` snapshot для Task 11 (методика A).
6. Task 10 — только когда и Phase 1 (Task 6), и Phase 2 (Task 9b + pre-flight summary coverage ≥ 90%) завершены.
7. Phase 3 — опциональная полировка.

## Ownership Boundary
Этот план владеет только файлом `.ai-factory/plans/bench-summary-restore.md`. Изменения в `RULES.md`, `ARCHITECTURE.md`, `ROADMAP.md` не планируются. Обновление `.ai-factory/RESEARCH.md` (Task 11) и `.ai-factory/benchmarks/README.md`/`summary-baseline.json` — в границах benchmark-артефактов, не рулящих артефактов `/aif-roadmap` и `/aif-rules`.
