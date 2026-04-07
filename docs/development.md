[← Архитектура](architecture.md) · [Back to README](../README.md) · [AI Factory →](ai-factory-workflow.md)

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
  cli.ts                    # CLI entry point (Commander, 9 commands)
  mcp-entry.ts              # MCP server entry point
  config/                   # Zod-схемы, YAML-загрузчик, дефолты
  commands/                 # init, index, list, remove, status, export, import, re-embed, gc
  export/                   # Export/import v2: manifest, archive, exporter, importer, sanitizer
  chunks/                   # Markdown, FixedSize, TreeSitter, Fallback, Dispatcher
    code/                   # tree-sitter + fallback chunkers
  embeddings/               # Jina, OpenAI, SiliconFlow, factory
  search/                   # Branch-aware SearchCoordinator, RRF fusion, narrow/broad vector
    reranker/               # Jina, SiliconFlow, Noop, factory
  sources/                  # FileFilter, scanLocalFiles, Git clone/pull, snapshot fingerprints
    fingerprint.ts          # Генерация snapshot fingerprint (tree/dirty/workspace форматы)
    git.ts                  # Локальный git-анализ: 11 методов (resolveRepoContext, getCurrentRef, etc.)
  status/                   # SystemStatusSnapshot: sources, views, blobs, embeddings метрики
  storage/                  # PostgreSQL: 6-table schema, migrator, один storage-класс на таблицу
    migrations/             # SQL-миграции (001-005: initial → branch_views_rebuild)
    sources.ts              # SourceStorage
    source-views.ts         # SourceViewStorage (branch/workspace snapshots)
    file-blobs.ts           # FileBlobStorage (file body dedup)
    indexed-files.ts        # IndexedFileStorage (per source_view)
    chunk-contents.ts       # ChunkContentStorage (content + embedding dedup, BM25/vector search)
    chunks.ts               # ChunkStorage (occurrence-level rows)
  indexer/                  # Branch-aware Indexer, snapshot detection, view reconciliation, progress
  mcp/                      # MCP server + tools
    tools/                  # search (с branch), read_source (blob-backed), list_sources, status
  utils/                    # retry с backoff, concurrency limiter
```

## See Also

- [Архитектура](architecture.md) — общая схема, search pipeline, chunking
- [CLI-команды](cli.md) — полная справка по всем командам
