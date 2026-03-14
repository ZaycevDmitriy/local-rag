[← MCP-интеграция](mcp-integration.md) · [Back to README](../README.md) · [Разработка →](development.md)

# Архитектура

## Общая схема

```
                   rag.config.yaml
                        |
          +-------------+-------------+
          |                           |
     CLI (rag)                  MCP Server
     index/list/remove/         search/read/
     status/export/             list/status
     import/re-embed
          |                           |
          +-------------+-------------+
                        |
                   PostgreSQL
              pgvector + tsvector
```

Два процесса, одна БД:

- **CLI** — индексация: source -> scan -> chunk -> embed -> store. Запускается вручную, завершается после работы.
- **MCP Server** — поиск: принимает запросы через stdio, выполняет hybrid search, возвращает результаты. Запускается AI-клиентом автоматически.

## Search Pipeline

```
Query -> embed -> parallel [BM25 (tsvector, top 50), Vector (pgvector cosine, top 50)]
  -> RRF Fusion (k=60) -> Jina Rerank (top 50 -> top 10) -> Response
```

## Chunking

| Тип файла | Стратегия | Детали |
|-----------|-----------|--------|
| `.ts`, `.tsx`, `.js`, `.jsx` | tree-sitter | AST-парсинг: функции, классы, методы, интерфейсы |
| `.java`, `.kt` | tree-sitter | AST-парсинг: классы, методы, FQN с пакетом; graceful degradation если грамматика не установлена |
| `.py`, `.go`, `.rs` и др. | Fallback | Разбиение по пустым строкам + отслеживание строк |
| `.md`, `.mdx` | Markdown | Разбиение по заголовкам с сохранением иерархии |
| Остальные | Fixed-size | Фиксированные блоки по токенам с перекрытием |

## Tech Stack

| Компонент | Технология |
|-----------|-----------|
| Язык | TypeScript (ESM, strict) |
| БД | PostgreSQL 16 + pgvector + tsvector |
| Эмбеддинги | Jina Embeddings v3 / OpenAI |
| Реранкинг | Jina Reranker v2 |
| AST-парсинг | tree-sitter |
| MCP | @modelcontextprotocol/sdk (stdio) |
| CLI | Commander |
| Конфиг | YAML + Zod-валидация |
| Тесты | Vitest (336 тестов) |

## See Also

- [Разработка](development.md) — структура проекта, команды разработки
- [Конфигурация](configuration.md) — параметры поиска (веса, topK, RRF)
