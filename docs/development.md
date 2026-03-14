[← Архитектура](architecture.md) · [Back to README](../README.md)

# Разработка

## Команды

```bash
# Запуск без сборки (через tsx).
npx tsx src/cli.ts status

# Сборка.
npm run build

# Линтинг.
npm run lint

# Проверка типов.
npm run typesCheck

# Тесты.
npm test

# MCP Inspector (отладка MCP-сервера).
npx @modelcontextprotocol/inspector node dist/mcp-entry.js --config ./rag.config.yaml
```

## Структура проекта

```
src/
  cli.ts                    # CLI entry point (Commander)
  mcp-entry.ts              # MCP server entry point
  config/                   # Zod-схемы, YAML-загрузчик, дефолты
  commands/                 # init, index, list, remove, status, export, import, re-embed
  export/                   # Экспорт/импорт: manifest, archive, exporter, importer, sanitizer
  chunks/                   # Markdown, FixedSize, TreeSitter, Fallback, Dispatcher
    code/                   # tree-sitter + fallback chunkers
  embeddings/               # Jina, OpenAI, factory
  search/                   # SearchCoordinator, RRF fusion
    reranker/               # Jina, Noop, factory
  sources/                  # FileFilter, scanLocalFiles, Git clone/pull
  storage/                  # PostgreSQL: schema, migrator, CRUD
    migrations/             # SQL-миграции
  indexer/                  # Indexer, incremental, progress
  mcp/                      # MCP server + tools
    tools/                  # search, read_source, list_sources, status
```

## See Also

- [Архитектура](architecture.md) — общая схема, search pipeline, chunking
- [CLI-команды](cli.md) — полная справка по всем командам
