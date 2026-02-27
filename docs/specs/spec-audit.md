# Аудит соответствия реализации спецификации

**Дата:** 2026-02-27
**Охват:** Фазы 1–7 (фаза 8 отложена, MCP подключается через CWD)
**Методология:** сравнение `docs/specs/local-rag-spec-new.md` с кодом; интервью с автором проекта.

**Обновление 2026-02-27:** расхождения A1–A7, B1, C1, D1 исправлены в коммите `13d7b1c`.

---

## Что работает корректно

| Область | Статус |
|---------|--------|
| Core pipeline: embed → BM25 + vector → RRF → rerank | ✓ |
| PostgreSQL схема: pgvector + tsvector + HNSW/GIN индексы | ✓ |
| Инкрементальная индексация (SHA-256 хэши файлов) | ✓ |
| CLI: init, index, list, remove, status | ✓ |
| Jina embeddings v3 (1024d) + retry | ✓ |
| Jina Reranker v2 + NoopReranker | ✓ |
| tree-sitter: TypeScript/TSX/JavaScript/JSX (полный AST) | ✓ |
| tree-sitter: Java — extractPackage, visitNode, FQN, Javadoc | ✓ |
| tree-sitter: Kotlin — class/object/companion/extension fn/properties | ✓ |
| Graceful degradation Java/Kotlin (optionalDependencies + warn) | ✓ |
| FallbackChunker (перекрытие, line numbers) | ✓ |
| MarkdownChunker (по заголовкам) | ✓ |
| FixedSizeChunker | ✓ |
| ChunkDispatcher (маршрутизация по расширению) | ✓ |
| Git-источники (cloneOrPull) | ✓ |
| .gitignore + .ragignore фильтрация | ✓ |
| MCP stdio сервер (4 инструмента подключаются) | ✓ |
| Config: YAML + Zod + CWD/global fallback | ✓ |
| OpenAI embedder (абстракция TextEmbedder) | ✓ |

---

## Расхождения

### A. MCP API — несоответствия inputSchema и форматов ответов

#### A1. `search` — отсутствуют фильтры `sourceType` и `pathPrefix` ✓ исправлено

- **Спецификация:** `inputSchema` содержит `sourceType?: string` и `pathPrefix?: string`
- **Реализация:** `src/mcp/tools/search.ts` — только `query`, `topK`, `sourceId`
- **Причина:** случайный пропуск при реализации
- **Влияние:** невозможно ограничить поиск по типу источника или поддереву пути
- **Связано с:** A6 (SearchQuery уже имеет поля, но pipeline не использует)

#### A2. `search` — topK max 50 вместо 100 ✓ исправлено

- **Спецификация:** `topK` — максимум 100
- **Реализация:** `z.number().min(1).max(50)` в `src/mcp/tools/search.ts:24`
- **Влияние:** при широком поиске по большой кодовой базе агент ограничен 50 результатами

#### A3. `list_sources` — отсутствуют фильтры `pathPrefix` и `sourceType` ✓ исправлено

- **Спецификация:** `inputSchema` содержит `pathPrefix?: string` и `sourceType?: string`
- **Реализация:** `src/mcp/tools/list-sources.ts` — только `limit`
- **Влияние:** нет способа отфильтровать источники по типу или пути через MCP

#### A4. `list_sources` — лишнее поле `createdAt` в ответе ✓ исправлено

- **Спецификация:** поля ответа — `id`, `name`, `type`, `path`, `lastIndexedAt`, `chunkCount`
- **Реализация:** возвращает также `createdAt` (поле из таблицы `sources`)
- **Влияние:** незначительно — лишняя информация, но не сломает агента; нарушает контракт

#### A5. `read_source` — отсутствует входной параметр `headerPath` ✓ исправлено

- **Спецификация:** `inputSchema` содержит `headerPath?: string` для фильтрации по заголовку markdown
- **Реализация:** `src/mcp/tools/read-source.ts` — только `chunkId`, `path`, `sourceName`, `startLine`, `endLine`, `context`
- **Влияние:** нельзя извлечь конкретный раздел документации по заголовку

#### A6. `read_source` — формат ответа не соответствует спецификации ✓ исправлено

- **Спецификация:** возвращает `{ content: string, path: string, sourceType: string, metadata: object }`
- **Реализация:** возвращает плоский текст с content/path/sourceType без поля `metadata`
- **Статус:** инструмент не тестировался в боевых условиях — проблема не проявилась

#### A7. `status` — структура ответа отличается от спецификации ✓ исправлено

- **Спецификация:** `{ database: { connected, schemaVersion, totalSources, totalChunks }, providers, search }`
- **Реализация:** `{ database: { connected, host, port, name }, stats: { sources, chunks }, providers, search, treeSitterLanguages }`
  - Нет `schemaVersion` и `totalSources`/`totalChunks` в `database`
  - Дополнительное поле `treeSitterLanguages` (расширение сверх спецификации — полезное)
  - `stats` — отдельный объект вместо полей в `database`

### B. База данных

#### B1. Отсутствует индекс `idx_chunks_path` ✓ исправлено

- **Спецификация:** `CREATE INDEX idx_chunks_path ON chunks USING GIN ((metadata->>'path') gin_trgm_ops)`
- **Реализация:** отсутствует в `src/storage/migrations/001_initial.ts`
- **Влияние:** при добавлении фильтра `pathPrefix` в coordinator — seq scan на больших датасетах
- **Примечание:** фильтр `pathPrefix` ещё не реализован, но индекс нужно добавить до его появления

### C. Конфигурация

#### C1. Провайдер `mock` в Zod-схеме production ✓ исправлено

- **Спецификация:** провайдеры embeddings — `jina`, `openai`, `self-hosted`; reranker — `jina`, `none`
- **Реализация:** `src/config/schema.ts` содержит `mock` как допустимое значение
- **Решение:** убрать `mock` из `schema.ts`, оставить только в тестовых утилитах
- **Риск:** пользователь может случайно поставить `provider: mock` в `rag.config.yaml`

#### C2. `resolveConfigPath` — силент-фоллбэк при несуществующем явном пути

- **Спецификация:** явный `--config path/to/nonexistent.yaml` → throw с понятной ошибкой
- **Реализация:** `src/config/loader.ts` возвращает `null`, вызывающий код делает fallback в CWD
- **Влияние:** пользователь указал явный путь с опечаткой — молча стартует с другим конфигом
- **Примечание:** фаза 8 переработает `resolveConfigPath`, это можно исправить тогда же

### D. SearchCoordinator — нереализованные фильтры

#### D1. `SearchQuery.sourceType` и `SearchQuery.pathPrefix` не используются ✓ исправлено

- **Спецификация:** `sourceType` и `pathPrefix` должны фильтровать результаты в SQL-запросе
- **Реализация:** поля типа определены в `src/search/types.ts`, но SQL в `coordinator.ts` их не применяет
- **Связано с:** A1 — MCP inputSchema тоже не передаёт эти поля
- **Статус:** нужно реализовать одновременно: SQL-фильтрация + MCP inputSchema + индекс B1

### E. Фаза 8 (отложено — не блокирует)

| Пункт | Описание |
|-------|----------|
| E1 | `mcp-entry.ts` — нет `--config <path>` аргумента |
| E2 | `loader.ts` — нет `RAG_CONFIG` env var |
| E3 | `resolveConfigPath` — fallback вместо throw (связано с C2) |

**Статус:** не реализовано, но MCP подключается через CWD. Приоритет — низкий.

---

## Итоговая таблица

| ID | Категория | Описание | Статус |
|----|-----------|----------|--------|
| A1 | MCP API | `search` — нет `sourceType`/`pathPrefix` в inputSchema | ✓ исправлено |
| A2 | MCP API | `search` — topK max 50 вместо 100 | ✓ исправлено |
| A3 | MCP API | `list_sources` — нет фильтров `pathPrefix`/`sourceType` | ✓ исправлено |
| A4 | MCP API | `list_sources` — лишнее поле `createdAt` | ✓ исправлено |
| A5 | MCP API | `read_source` — нет `headerPath` | ✓ исправлено |
| A6 | MCP API | `read_source` — нет поля `metadata` в ответе | ✓ исправлено |
| A7 | MCP API | `status` — структура ответа расходится со спецификацией | ✓ исправлено |
| B1 | БД | Нет `idx_chunks_path` GIN trgm индекса | ✓ исправлено |
| C1 | Конфиг | `mock` провайдер в production Zod-схеме | ✓ исправлено |
| C2 | Конфиг | `resolveConfigPath` — silent fallback вместо throw | Отложено (фаза 8) |
| D1 | Search | `SearchQuery.sourceType`/`pathPrefix` определены, но не применяются | ✓ исправлено |
| E1–E3 | Фаза 8 | `--config`, `RAG_CONFIG`, strict resolveConfigPath | Отложено |

---

## Рекомендации по реализации

**Связанные расхождения — реализовывать вместе:**

1. **A1 + A3 + D1 + B1** — один PR: SQL-фильтры в coordinator + MCP inputSchema + индекс миграции
2. **A6 + A5** — один PR: доработка `read_source` (metadata + headerPath)
3. **A7** — привести структуру `status` к спецификации (schemaVersion из таблицы migrations)
4. **C1** — удалить `mock` из `schema.ts`; убедиться, что тесты используют мок через override, не через конфиг
5. **A2** — поднять topK до 100 в inputSchema
6. **A4** — убрать `createdAt` из `list_sources` ответа (или добавить в спецификацию)
7. **C2 + E1–E3** — реализовать как часть фазы 8
