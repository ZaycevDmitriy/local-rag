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
| Парсинг кода | tree-sitter (TS/JS), fallback для остальных |
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

### Фаза 1: Ядро (поиск работает)

Инициализация проекта, конфиг, PostgreSQL, chunking (markdown + text), Jina embeddings, storage CRUD, hybrid search, CLI (init + index).

### Фаза 2: MCP + Rerank

Jina Reranker, MCP stdio сервер с 4 инструментами, инкрементальная индексация.

### Фаза 3: Код

tree-sitter chunker для TS/JS, fallback chunker, Git-источники.

### Фаза 4: Полировка

FileFilter (.gitignore/.ragignore), CLI list/remove/status, OpenAI embedder.

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
