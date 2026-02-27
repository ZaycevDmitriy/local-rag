# Local RAG — общий план реализации

## Цель

Персональная система семантического поиска по коду и документации. Hybrid search (BM25 + vector + rerank) через MCP-интерфейс для Claude Code / Cursor.

## Технический стек

| Компонент | Технология |
|-----------|-----------|
| Язык | TypeScript (ESM, strict) |
| БД | PostgreSQL 16 (Docker) + pgvector + tsvector |
| Эмбеддинги | Jina Embeddings v3 (1024d), абстракция `TextEmbedder` |
| Реранкер | Jina Reranker v2, абстракция `Reranker` |
| Парсинг кода | tree-sitter (TS/JS/Java/Kotlin), fallback для остальных |
| MCP | @modelcontextprotocol/sdk (stdio) |
| Конфиг | YAML + Zod-валидация |
| CLI | commander |
| Тесты | Vitest |
| Линтинг | ESLint + @typescript-eslint |

## Архитектура

Два процесса, одна БД:

1. **CLI (`src/cli.ts`)** — индексация: source -> chunk -> embed -> store. Запускается вручную.
2. **MCP Server (`src/mcp-entry.ts`)** — поиск: 4 инструмента. Запускается Claude Code/Cursor по stdio.

```
src/
├── config/       # Zod-схема + YAML loader
├── sources/      # Локальные папки, git-клоны, фильтрация файлов
├── chunks/       # Chunking: markdown, text, code (tree-sitter)
├── embeddings/   # TextEmbedder: Jina, OpenAI
├── search/       # Hybrid search: BM25 + vector + RRF + reranker
├── storage/      # PostgreSQL: миграции, CRUD для chunks/sources
├── indexer/      # Pipeline индексации, инкрементальность, прогресс
├── mcp/          # MCP stdio server + 4 tool-обработчика
├── commands/     # CLI-команды (init, index, list, remove, status)
├── cli.ts        # CLI entry point
└── mcp-entry.ts  # MCP entry point
```

## Search Pipeline

```
Query -> embed query -> parallel [BM25 (tsvector, top 50) + Vector (pgvector cosine, top 50)]
  -> RRF Fusion (k=60) -> Jina Rerank (top 50 -> top 10) -> Response
```

## Порядок реализации

| Фаза | Описание | Шаги | Файл плана |
|------|----------|------|-----------|
| 1 | Ядро | 8 шагов | [phase-1-core.md](./phase-1-core.md) |
| 2 | MCP + Rerank | 3 шага | [phase-2-mcp-rerank.md](./phase-2-mcp-rerank.md) |
| 3 | Код | 3 шага | [phase-3-code.md](./phase-3-code.md) |
| 4 | Полировка | 3 шага | [phase-4-polish.md](./phase-4-polish.md) |
| 5 | Рефакторинг экстракторов | 7 шагов | [phase-5-refactor-extractors.md](./phase-5-refactor-extractors.md) |
| 6 | Java tree-sitter | 7 шагов | [phase-6-java-tree-sitter.md](./phase-6-java-tree-sitter.md) |
| 7 | Kotlin tree-sitter | 8 шагов | [phase-7-kotlin-tree-sitter.md](./phase-7-kotlin-tree-sitter.md) |
| 8 | Config Path Resolution | 3 шага | [phase-8-config-path.md](./phase-8-config-path.md) |
| — | Исправление расхождений со спецификацией | A1–A7, B1, C1, D1 | [spec-audit.md](../specs/spec-audit.md) |

### Фаза 1: Ядро (поиск работает)

Инициализация проекта, конфиг, PostgreSQL, chunking (markdown + text), Jina embeddings, storage CRUD, hybrid search, CLI (init + index).

### Фаза 2: MCP + Rerank

Jina Reranker, MCP stdio сервер с 4 инструментами, инкрементальная индексация.

### Фаза 3: Код

tree-sitter chunker для TS/JS, fallback chunker, Git-источники.

### Фаза 4: Полировка

FileFilter (.gitignore/.ragignore), CLI list/remove/status, OpenAI embedder.

### Фаза 5: Рефакторинг экстракторов

Подготовка к мультиязычным AST-экстракторам: выделение extractor-types.ts, переименование ast-extractor → ts-extractor, расширение ChunkMetadata (fragmentSubtype, receiverType), parser cache, динамический supports(), strictAst конфиг.

### Фаза 6: Java tree-sitter

tree-sitter-java (optionalDependencies), java-extractor.ts: class, record, interface, annotation type, enum, method, constructor. FQN с package. Аннотации/Javadoc capture. Graceful degradation.

### Фаза 7: Kotlin tree-sitter

tree-sitter-kotlin (optionalDependencies), kotlin-extractor.ts: class (data/sealed), object, companion object, function, extension function (receiverType), enum, interface. Top-level property grouping. FQN с package. KDoc capture. Обновление rag status.

### Исправление расхождений со спецификацией (2026-02-27)

Аудит `docs/specs/spec-audit.md` выявил 10 расхождений. Все исправлены в коммите `13d7b1c`:

- **A1/D1**: фильтры `sourceType`/`pathPrefix` в `search` (SQL + MCP inputSchema)
- **A2**: topK max повышен с 50 до 100
- **A3/A4**: фильтры в `list_sources`, убран `createdAt`
- **A5/A6**: `headerPath` в `read_source` + структурированный JSON ответ
- **A7**: `status` приведён к спецификации (`schemaVersion`, `database.totalSources/totalChunks`, `providers.configured`, `indexing.lastIndexedAt`)
- **B1**: миграция `003_path_index` (pg_trgm + GIN-индекс по `metadata->>'path'`)
- **C1**: `mock` провайдер удалён из Zod-схемы

### Фаза 8: Config Path Resolution

Аргумент `--config <path>` в mcp-entry.ts, переменная окружения `RAG_CONFIG` в loader.ts. Позволяет MCP-серверу находить конфиг при запуске из произвольной CWD (глобальная регистрация в `~/.claude.json`).

## Соглашения

- **ESM**: `"type": "module"` в package.json, `import/export` везде
- **Strict TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true`
- **Тесты**: Vitest, файлы в `__tests__/` рядом с модулем
- **Линтинг**: ESLint с @typescript-eslint
- **Комментарии**: на русском языке
- **Одинарные кавычки** в строках
- **2 пробела** для отступов
- **Точка с запятой** в конце строк

## Верификация

- **Фаза 1**: `docker compose up -d && npm run build && rag init && rag index --path ./test-folder --name test`
- **Фаза 2**: `npx @modelcontextprotocol/inspector node dist/mcp-entry.js`
- **Фаза 3**: Индексация .ts/.js с FQN; `rag index --git <url>`
- **Фаза 4**: Фильтрация через .gitignore/.ragignore; CLI list/remove/status; OpenAI embedder
- **Фаза 5**: `npm run build && npm test` — все существующие тесты проходят после рефакторинга
- **Фаза 6**: Индексация Java-проекта с AST; `rag status` показывает Java: active
- **Фаза 7**: Индексация Kotlin-проекта с AST; `rag status` показывает Kotlin: active; MCP search по Java/Kotlin коду
- **Фаза 8**: MCP-сервер стартует с `--config /path/to/rag.config.yaml` из любой CWD; `RAG_CONFIG` env var работает
