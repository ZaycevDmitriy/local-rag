[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Архитектура →](architecture.md)

# MCP-интеграция

## Claude Code

Добавьте в `.mcp.json` проекта или глобальный `~/.claude.json`.

Вариант с `RAG_CONFIG` (рекомендуется для глобального сервера — не зависит от рабочей директории):

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "node",
      "args": ["/absolute/path/to/local-rag/dist/mcp-entry.js"],
      "env": {
        "RAG_CONFIG": "/absolute/path/to/local-rag/rag.config.yaml",
        "JINA_API_KEY": "your_key"
      }
    }
  }
}
```

Вариант с `--config`:

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "node",
      "args": [
        "/absolute/path/to/local-rag/dist/mcp-entry.js",
        "--config", "/absolute/path/to/local-rag/rag.config.yaml"
      ],
      "env": {
        "JINA_API_KEY": "your_key"
      }
    }
  }
}
```

## Cursor

Добавьте в `.cursor/mcp.json` проекта:

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "node",
      "args": ["/absolute/path/to/local-rag/dist/mcp-entry.js"],
      "env": {
        "RAG_CONFIG": "/absolute/path/to/local-rag/rag.config.yaml",
        "JINA_API_KEY": "your_key"
      }
    }
  }
}
```

## MCP-инструменты

| Инструмент | Описание |
|------------|----------|
| `search` | Гибридный семантический поиск. Параметры: `query`, `topK` (1-100, по умолчанию 10), `sourceId`, `sourceType` (code/markdown/text/pdf), `pathPrefix` |
| `read_source` | Чтение фрагмента источника по `chunkId`, по координатам (`sourceName` + `path` + `startLine`/`endLine`) или по заголовку (`headerPath`). Возвращает структурированный JSON |
| `list_sources` | Список проиндексированных источников. Фильтры: `sourceType` (local/git), `pathPrefix`, `limit` |
| `status` | Статус системы: `schemaVersion`, `totalSources`/`totalChunks`, провайдеры, `lastIndexedAt` |

## See Also

- [Конфигурация](configuration.md) — настройка rag.config.yaml и провайдеров
- [CLI-команды](cli.md) — индексация и управление источниками
