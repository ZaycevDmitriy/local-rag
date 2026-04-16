# Implementation Plan: Repair Indexing Pipeline & Reliability

Branch: feature/repair-indexing-pipeline
Created: 2026-04-08
Refined: 2026-04-16 (iteration 3, aif-improve)

## Settings
- Testing: yes
- Logging: verbose
- Docs: yes

## Roadmap Linkage
Milestone: "Indexing repair & reliability"
Rationale: Ремонт повреждённого active view baseline, per-batch error isolation в embeddings, валидация JSON-ответов провайдера, извлечение generator functions — всё это reliability-задачи, которые не покрываются существующими milestones.

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary)

Goal: Восстановить полноту active view `4441-lad-10334-pos`, затем довести recall поиска до уровня "компонент -> Redux -> saga -> API" в top-10
Constraints:
- Active view содержит `6276` indexed_files, но только `313` chunk occurrences и `6241` файлов без chunks
- Historical views `master/develop` имеют нормальный chunk coverage, но слабое embedding coverage (~306/14205)
- `diff-scan` не восстанавливает неизменённые `indexed_files` без chunks (нет repair-механики)
- Single try/catch вокруг всего embedding phase — один failed batch обрушивает весь этап
- `generator_function_declaration` не извлекается ts-extractor'ом
Decisions:
- `313` chunks на active view подтверждены SQL-проверкой
- Для active view embeddings не блокер: `280/280` unique chunks уже имеют embedding
- Корневая причина: broken baseline + diff-scan without repair
- Текущий embeddings provider: `siliconflow` через `OpenAITextEmbedder`

## Commit Plan
- **Commit 1** (после задач 1-4): `fix: add repair mechanism for indexed_files without chunks`
- **Commit 2** (после задач 5-7): `fix: per-batch error isolation and JSON validation in embeddings`
- **Commit 3** (после задач 8-9): `feat: add generator_function_declaration to ts-extractor`
- **Commit 4** (после задач 10-12): `test: add tests for repair, embeddings resilience, generator extraction`

## Tasks

### Phase 1: Repair mechanism for chunkless indexed_files

- [x] Task 1: Добавить метод `getChunklessFiles` в storage

  **Deliverable:** Новый метод в `src/storage/indexed-files.ts`, который возвращает `indexed_files` без ассоциированных chunks для данного `source_view_id`.

  **Файлы:** `src/storage/indexed-files.ts`

  **Детали реализации:**
  - SQL: `SELECT inf.* FROM indexed_files inf LEFT JOIN chunks c ON c.indexed_file_id = inf.id WHERE inf.source_view_id = $1 AND c.id IS NULL`
  - Возвращаемый тип: `IndexedFileRow[]` (тот же, что у `getByView`)
  - Метод public, добавить в barrel export если нужно

  **Логирование:**
  - DEBUG: `[IndexedFileStorage.getChunklessFiles] source_view_id=${id}, found=${count}`

- [x] Task 2: Добавить repair-логику в `Indexer.indexView`

  **Deliverable:** При `indexView` после основного pipeline (шаг 7 — chunk occurrences, строка ~167) и ДО шага embedding (строка ~170), проверить наличие chunkless indexed_files и автоматически пропустить их через chunking pipeline.

  **Файлы:** `src/indexer/indexer.ts`

  **Детали реализации:**
  - После `this.progress.onStoreComplete()` (строка 167) и до блока `// 8. Генерируем embeddings`, вызвать `this.indexedFileStorage.getChunklessFiles(view.id)`
  - Для каждого chunkless файла: прочитать content из `file_blobs` через `this.fileBlobStorage.getByHash(file.content_hash)` (метод уже существует в `FileBlobStorage`, строка 43)
  - **Null-check обязателен:** если `getByHash()` вернул `null` (orphan indexed_file без blob) — пропустить файл с WARN-логом и продолжить repair остальных: `if (!blob) { console.warn(...); continue; }`
  - Прогнать content через `this.dispatcher.chunk(fileContent)`, собрать repair chunks в отдельный массив
  - **Порядок вставок (критично, иначе embeddings не сгенерируются):**
    1. Дедуплицировать repair chunks по `contentHash` → `repairContentInserts: ChunkContentInsert[]`
    2. `await this.chunkContentStorage.insertBatch(repairContentInserts)` — иначе `getByHashes` на шаге embedding не найдёт строк
    3. Построить `repairOccurrences` с `indexedFileId = chunklessFile.id` (НЕ через `fileIdMap` — chunkless файлы отсутствуют в `changedFiles`, их id берём напрямую из `IndexedFileRow`)
    4. `await this.chunkStorage.insertBatch(repairOccurrences)`
    5. `contentInserts.push(...repairContentInserts)` — для единого embedding-прохода на шаге 8
  - Repair работает только если `chunklessFiles.length > 0` (не замедляет нормальный путь)
  - Добавить `repairedFiles: number` в `IndexResult`

  **Логирование:**
  - INFO: `[Indexer.indexView] Repairing ${count} indexed files without chunks`
  - DEBUG: `[Indexer.indexView] Repaired file: ${path} -> ${chunkCount} chunks`
  - WARN: `[Indexer.indexView] Repair skipped ${path}: blob not found for content_hash=${hash}`
  - WARN: `[Indexer.indexView] Repair failed for ${path}: ${error.message}`

- [x] Task 3: Добавить `repairedFiles` в `IndexResult` и CLI output

  **Deliverable:** `IndexResult.repairedFiles` отображается в `ConsoleProgress.onComplete()`.

  **Файлы:** `src/indexer/progress.ts`, `src/indexer/indexer.ts` (тип `IndexResult`)

  **Детали реализации:**
  - Добавить поле `repairedFiles?: number` в `IndexResult` интерфейс (`src/indexer/progress.ts`, строка 5)
  - В `ConsoleProgress.onComplete()` (строка 61) добавить вывод `Восстановлено: N файлов` если `result.repairedFiles > 0`
  - CLI команда `src/commands/index-cmd.ts` не требует изменений — она вызывает `indexSourceFromConfig`, который внутри использует `ConsoleProgress`

  **Логирование:**
  - INFO: `  Восстановлено: ${result.repairedFiles} файлов` (только если > 0)

- [x] Task 4: Пробросить repair-результат через `runtime.ts`

  **Deliverable:** `indexSourceFromConfig` логирует repair-статистику через существующий `ConsoleProgress`.

  **Файлы:** `src/indexer/runtime.ts`

  **Детали реализации:**
  - `indexSourceFromConfig` (строка 167) вызывает `indexer.indexView()` (строка 306) и выбрасывает `IndexResult`
  - Сохранить результат: `const result = await indexer.indexView(...)` вместо голого `await`
  - Передать `result.repairedFiles` в `finalizeView` или логировать напрямую если > 0
  - Не менять сигнатуру `indexSourceFromConfig` (остаётся `void`) — repair-статистика идёт через ConsoleProgress

  **Логирование:**
  - DEBUG: `[runtime] indexView result: repaired=${result.repairedFiles ?? 0}`

<!-- Commit checkpoint: tasks 1-4 — fix: add repair mechanism for indexed_files without chunks -->

### Phase 2: Resilient embeddings pipeline

- [x] Task 5: Per-batch try/catch в pMap callback

  **Deliverable:** Каждый batch в `pMap` обрабатывается независимо — один failed batch не обрушивает весь embedding phase.

  **Файлы:** `src/indexer/indexer.ts`

  **Детали реализации:**
  - Обернуть callback внутри `pMap` (строки 191-200) в try/catch
  - При ошибке batch: логировать, вернуть `null` (или пустой массив), увеличить `failedBatches` counter
  - После pMap: отфильтровать null-результаты, собрать успешные embeddings
  - **Оставить облегчённый внешний try/catch** (строки 172-214) для ошибок `getByHashes` и `updateEmbeddings` — они не покрываются per-batch isolation
  - `embeddingsDeferred` = количество текстов из failed batches (не все `contentInserts.length`)
  - **Retry scope (важно):** `openai.ts:81` уже использует `fetchWithRetry(maxRetries=3)` — транспортные ошибки (5xx, 429, network) уже ретраятся внутри API-клиента. Per-batch retry в pMap нужен ТОЛЬКО для ошибок, которые bypass fetchWithRetry: JSON parse failures (Task 6), structural validation failures (Task 6), `Error` из `!response.ok` branch. Для этих случаев — retry 1 раз, при повторной ошибке — defer. Не ретраить на network-ошибках, чтобы не получить 4× повторов.
  - **Прогресс в catch:** обязательно инкрементировать `completedCount += batch.length` и вызывать `this.progress.onEmbedProgress(completedCount, needEmbedding.length)` и в try, и в catch — иначе UI застрянет на старом значении при failed batch

  **Логирование:**
  - WARN: `[Indexer.indexView] Embedding batch ${i}/${total} failed (bypasses fetchWithRetry): ${error.message}, retrying once...`
  - WARN: `[Indexer.indexView] Embedding batch ${i}/${total} retry failed: ${error.message}, ${batch.length} deferred`
  - INFO: `[Indexer.indexView] Embeddings: ${successCount}/${totalCount} succeeded, ${deferredCount} deferred`
  - DEBUG: `[Indexer.indexView] Batch ${i} completed: ${batch.length} embeddings in ${ms}ms`

- [x] Task 6: Обработка truncated JSON и структурная валидация в `OpenAITextEmbedder`

  **Deliverable:** `SyntaxError` от truncated JSON перехватывается с descriptive error, структура ответа валидируется перед использованием.

  **Файлы:** `src/embeddings/openai.ts`

  **Детали реализации:**

  **Часть A — Обработка truncated JSON:**
  - Оригинальный баг: `SyntaxError: Expected ',' or ']' after array element in JSON at position 815029` — truncated JSON от SiliconFlow API
  - Заменить `const json = (await response.json()) as OpenAIEmbeddingResponse` на `response.text()` + `JSON.parse()`:
    ```ts
    const text = await response.text();
    let json: OpenAIEmbeddingResponse;
    try {
      json = JSON.parse(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${this.providerName}: malformed JSON response (${msg}). Body[0..200]: ${text.slice(0, 200)}`
      );
    }
    ```
  - **Почему не `response.clone()`:** `response.json()` потребляет body stream, после чего clone/повторное чтение невозможно. Подход `text()` + `JSON.parse()` атомарен и сохраняет raw text для диагностики.

  **Часть B — Структурная валидация:**
  - После `JSON.parse`: проверить, что `json.data` — массив
  - Проверить, что каждый элемент имеет `index` (number) и `embedding` (number[])
  - При невалидном ответе: бросить `Error` с описанием и первыми 200 chars `text`
  - Не использовать Zod — достаточно ручных проверок (3-4 строки)

  **Логирование:**
  - ERROR: `[OpenAITextEmbedder] Malformed JSON response: ${error.message}. Body preview: ${preview}`
  - ERROR: `[OpenAITextEmbedder] Invalid response structure: ${description}. Body preview: ${preview}`
  - DEBUG: `[OpenAITextEmbedder] Response validated: ${data.length} embeddings`

- [x] Task 7: Уменьшить размер batch и согласовать batch sizes

  **Deliverable:** Уменьшенный `EMBED_BATCH_SIZE` во всех точках входа.

  **Файлы:** `src/indexer/indexer.ts`, `src/embeddings/openai.ts`, `src/commands/re-embed-cmd.ts`

  **Детали реализации:**
  - Уменьшить `EMBED_BATCH_SIZE` с 64 до 32 в `indexer.ts` (строка 21) — снижает объём потери при ошибке
  - `BATCH_SIZE = 100` в `openai.ts` (строка 19) — уменьшить до 64. Двойной батчинг остаётся, но размеры согласованы: indexer (32) → openai (64, для `embedBatch` calls из `rag re-embed`)
  - `BATCH_SIZE = 64` в `re-embed-cmd.ts` (строка 8) — уменьшить до 32 для согласованности с indexer
  - **Trade-off (важно зафиксировать):** снижение 64→32 удваивает количество API-вызовов per indexing run (KariPos: `~14205/32 = 445 батчей`). При `EMBED_CONCURRENCY=3` это возрастает риск rate limit и увеличивает общее время. Если после имплементации rate limit проявится — поднять до 48 (промежуточный компромисс) или вернуться к 64 с расчётом на per-batch isolation + retry из Task 5

  **Логирование:**
  - Не требуется (изменение констант)

<!-- Commit checkpoint: tasks 5-7 — fix: per-batch error isolation and JSON validation in embeddings -->

### Phase 3: Generator function extraction

- [ ] Task 8: Добавить `generator_function_declaration` в ts-extractor

  **Deliverable:** `function*` извлекается как отдельный FUNCTION-чанк с корректным FQN.

  **Файлы:** `src/chunks/code/ts-extractor.ts`

  **Детали реализации:**
  - Добавить `case 'generator_function_declaration':` рядом с `case 'function_declaration':` (строка 50) — fallthrough на тот же блок
  - Логика идентична `function_declaration`: извлечь имя, построить FQN, создать FUNCTION fragment
  - Generators внутри класса работают автоматически: body класса обходится (строки 26-33), visitor попадает на новый case
  - **Также покрыть generator-expression в `checkLexicalDeclarationForArrow` (строки 150-166):** текущая проверка `valueNode.type === 'arrow_function' || valueNode.type === 'function'` не ловит `export const mySaga = function*() { ... }`. Добавить `|| valueNode.type === 'generator_function'` — это частый паттерн в Redux Saga и без этой правки `case 'generator_function_declaration'` в top-level не решит проблему полностью
  - Также добавить `generator_function` (без `_declaration`) в основном switch на случай разных tree-sitter версий, где declaration приходит как expression

  **Логирование:**
  - DEBUG: `[TsExtractor] Extracted generator function: ${fqn}`
  - DEBUG: `[TsExtractor] Extracted generator expression via const: ${fqn}`

- [ ] Task 9: Добавить рекурсию в default case для неизвестных container-узлов

  **Deliverable:** Неизвестные container-узлы (namespace, ambient_declaration) рекурсивно обходятся.

  **Файлы:** `src/chunks/code/ts-extractor.ts`

  **Детали реализации:**
  - В default case (строки 128-136): расширить список рекурсивных типов
  - Добавить `internal_module` (TypeScript namespace) к существующим `program`, `module`, `statement_block`
  - Опционально: рекурсия для любого узла с `namedChildren.length > 0` и `type` содержащим `_block` или `_body`

  **Логирование:**
  - DEBUG: `[TsExtractor] Recursing into unknown container: ${node.type}`

<!-- Commit checkpoint: tasks 8-9 — feat: add generator_function_declaration to ts-extractor -->

### Phase 4: Тесты

- [ ] Task 10: Тесты для repair mechanism (depends on 1, 2, 3, 4)

  **Deliverable:** Unit-тесты для `getChunklessFiles` и repair-логики в indexer.

  **Файлы:** `src/storage/__tests__/indexed-files.test.ts` (новый файл), `src/indexer/__tests__/indexer-repair.test.ts` (новый файл)

  **Детали реализации:**
  - Тест `getChunklessFiles`: создать indexed_file без chunks, проверить что возвращается; создать с chunks — не возвращается
  - Тест repair в indexer: mock chunkDispatcher + storage, проверить что chunkless файлы проходят через chunking
  - Тест: если chunkless файлов нет — repair не запускается (нет лишних SQL-запросов)
  - Тест: если blob отсутствует для content_hash — файл пропускается, repair продолжается для остальных
  - Использовать паттерн из `src/indexer/__tests__/indexer.test.ts` для mock-ов зависимостей

- [ ] Task 11: Тесты для per-batch isolation и JSON validation (depends on 5, 6, 7)

  **Deliverable:** Unit-тесты для per-batch error handling и JSON validation.

  **Файлы:** `src/indexer/__tests__/indexer-embeddings.test.ts` (новый файл), `src/embeddings/__tests__/openai.test.ts` (расширить)

  **Детали реализации:**
  - Тест per-batch: mock embedder, первый batch бросает Error, второй успешен — проверить что второй batch НЕ deferred
  - Тест retry: mock embedder, batch fail → retry success — проверить что batch НЕ deferred
  - Тест JSON SyntaxError: mock fetch с truncated JSON body — ожидать descriptive Error с body preview
  - Тест структурная валидация: подать невалидный response (missing `data`, wrong shape) — ожидать конкретную ошибку
  - Тест: валидный response проходит без ошибок
  - Паттерн тестов — как в существующем `src/embeddings/__tests__/openai.test.ts`

- [ ] Task 12: Тесты для generator function extraction (depends on 8, 9)

  **Deliverable:** Unit-тесты для извлечения `function*` и рекурсии в default case.

  **Файлы:** `src/chunks/code/__tests__/ts-extractor.test.ts` (новый файл)

  **Детали реализации:**
  - Тест: `function* mySaga() {}` извлекается как FUNCTION с FQN `mySaga`
  - Тест: `export function* mySaga() {}` — тоже извлекается
  - Тест: generator внутри класса получает class-qualified FQN
  - Тест: namespace `namespace Foo { function bar() {} }` — `bar` извлекается через рекурсию

<!-- Commit checkpoint: tasks 10-12 — test: add tests for repair, embeddings resilience, generator extraction -->

## Success Metrics

Измеримые критерии приёмки для каждой фазы. Проверяются SQL-запросами к БД local-rag и пробным поиском через MCP.

### Baseline (зафиксировать ДО начала работы)

Чтобы уметь сравнить "до/после", снять снапшот перед Task 1:

```sql
-- Active view (KariPos, branch 4441-lad-10334-pos):
SELECT sv.id AS view_id, sv.ref_name, COUNT(DISTINCT inf.id) AS indexed_files,
       COUNT(c.id) AS chunk_occurrences,
       COUNT(DISTINCT c.indexed_file_id) AS files_with_chunks
  FROM source_views sv
  LEFT JOIN indexed_files inf ON inf.source_view_id = sv.id
  LEFT JOIN chunks c ON c.source_view_id = sv.id
  WHERE sv.source_id = '87709deb-913d-4cce-88d1-8573837dcc3b'
    AND sv.ref_name = '4441-lad-10334-pos'
  GROUP BY sv.id, sv.ref_name;
-- Ожидаемый baseline: indexed_files=6276, chunk_occurrences=313, files_with_chunks=35
```

### Phase 1: Repair mechanism (Tasks 1-4)

**Основная метрика — files_without_chunks → 0:**
```sql
SELECT COUNT(*) FROM indexed_files inf
  LEFT JOIN chunks c ON c.indexed_file_id = inf.id
  WHERE inf.source_view_id = '<active_view_id>' AND c.id IS NULL;
-- Success: 0 (допустимо несколько пустых/отфильтрованных файлов)
-- Baseline: 6241
```

**Ключевые файлы цепочки получают chunks:**
```sql
SELECT inf.path, COUNT(c.id) AS chunks
  FROM indexed_files inf
  LEFT JOIN chunks c ON c.indexed_file_id = inf.id
  WHERE inf.source_view_id = '<active_view_id>'
    AND inf.path IN (
      'src/tsd/repricing/reducers/index.ts',
      'src/tsd/repricing/actions/repricing.ts',
      'src/shared/api/rest/superStorage/cell/index.ts'
    )
  GROUP BY inf.path;
-- Success: chunks > 0 для всех трёх файлов
-- Baseline: chunks = 0 для всех трёх
```

**Chunk count на порядок величин master/develop:**
```sql
SELECT sv.ref_name, COUNT(c.id) AS chunk_count
  FROM source_views sv LEFT JOIN chunks c ON c.source_view_id = sv.id
  WHERE sv.source_id = '87709deb-913d-4cce-88d1-8573837dcc3b'
  GROUP BY sv.ref_name ORDER BY sv.ref_name;
-- Success: 4441-lad-10334-pos сопоставим с master (~18178) и develop (~18373)
-- Baseline: 313 для active view
```

**CLI output показывает repair-статистику:**
- В выводе `rag index` присутствует строка `Восстановлено: N файлов` при N > 0

### Phase 2: Resilient embeddings (Tasks 5-7)

**Per-batch isolation — partial deferred вместо full deferred:**

Искусственный тест: замокать `embedder.embedBatch` так, чтобы падал только 1 из 3 батчей. Проверить итоговый `embeddingsDeferred`:
- Success: `embeddingsDeferred = batch_size` (только элементы из упавшего batch)
- Fail (регрессия): `embeddingsDeferred = contentInserts.length` (все)

**JSON parse error даёт descriptive сообщение:**

Искусственный тест: замокать `fetch` на возврат truncated JSON body. Ожидаемая ошибка в логах:
- `[OpenAITextEmbedder] Malformed JSON response: <parse error>. Body preview: <first 200 chars>`
- НЕ голое `SyntaxError: Expected ',' or ']' at position N`

**Historical views `master/develop` не деградировали:**
```sql
SELECT sv.ref_name, COUNT(c.id) AS chunk_count
  FROM source_views sv LEFT JOIN chunks c ON c.source_view_id = sv.id
  WHERE sv.source_id = '87709deb-913d-4cce-88d1-8573837dcc3b'
    AND sv.ref_name IN ('master', 'develop')
  GROUP BY sv.ref_name;
-- Success: chunk_count не упал относительно baseline (master ~18178, develop ~18373)
```

### Phase 3: Generator extraction (Tasks 8-9)

**Generator functions извлекаются как отдельные чанки:**
```sql
SELECT inf.path, c.start_line, c.end_line
  FROM chunks c JOIN indexed_files inf ON inf.id = c.indexed_file_id
  WHERE c.source_view_id = '<active_view_id>'
    AND inf.path LIKE '%saga%.ts'
  GROUP BY inf.path, c.start_line, c.end_line
  ORDER BY inf.path;
-- Success: > 1 chunk на типичный saga-файл (function* блоки разделены)
-- Baseline: 1 chunk на весь saga-файл
```

**Тестовый паттерн покрывает generator-expression:**
- Тест Task 12: `export const mySaga = function*() {}` извлекается с FQN `mySaga`

### End-to-end verification (финальная проверка)

**Сценарий "компонент → Redux → saga → API" стабильно в top-10:**

Через MCP `search` с `branch: "4441-lad-10334-pos"`:
```
query: "repricing fetchAddress saga API request"
```

Success-критерии:
- В top-10 результатах присутствуют ≥3 из 4 файлов: `reducers/index.ts`, `actions/repricing.ts`, `saga/repricing.ts`, `api/rest/superStorage/cell/index.ts`
- Результаты не требуют повторного `rag re-embed` после indexing

**Full-scan завершается без deferred > 90%:**

После `rag index --all` наблюдать CLI-вывод:
- Success: `Эмбеддинги отложены: N` где N < 10% от `totalCount` (например, <1400 из 14000)
- Fail: N = `totalCount` (full failure как в baseline screenshot `960/13986` deferred `14205`)

### Regression guards

Запустить после implementation:
- `npm test` — все существующие 471 тесты проходят
- `npm run typesCheck` — без ошибок
- `npm run lint` — без ошибок
- Baseline MCP `search` queries на KariPos возвращают те же топ-результаты (не деградировали)
