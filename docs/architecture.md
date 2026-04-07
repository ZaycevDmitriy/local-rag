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
      import/re-embed/gc
           |                           |
           +-------------+-------------+
                         |
                    PostgreSQL
     sources → source_views → file_blobs
                    ↓              ↓
             indexed_files → chunk_contents
                    ↓              ↓
                  chunks (occurrence rows)
```

Два процесса, одна БД (6 таблиц):

- **CLI** — индексация: source -> resolve git snapshot -> scan -> chunk -> dedup blobs/contents -> embed -> store. Запускается вручную, завершается после работы.
- **MCP Server** — поиск: принимает запросы через stdio, выполняет branch-aware hybrid search, возвращает результаты. Запускается AI-клиентом автоматически.

## Storage Model

Branch-aware модель с дедупликацией:

| Таблица | Назначение |
|---------|-----------|
| `sources` | Логические источники (name, type, path, active_view_id) |
| `source_views` | Branch/workspace снимки (view_kind, ref_name, snapshot_fingerprint) |
| `file_blobs` | Тела файлов с дедупликацией по content_hash |
| `indexed_files` | Файлы внутри view (source_view_id, path, content_hash) |
| `chunk_contents` | Дедуплицированные тела чанков + embedding + search_vector |
| `chunks` | Occurrence-level строки (source_view_id, indexed_file_id, ordinal, координаты) |

`read_source` читает файлы из `file_blobs` (snapshot), а не с файловой системы. Это позволяет читать неактивные ветки без checkout.

## Search Pipeline

```
Query -> resolve active_view_id (per source) -> embed query
  -> parallel [BM25 (tsvector, top 50), Vector (narrow/broad, top 50)]
  -> content-level dedup (per chunk_content_hash)
  -> RRF Fusion (k=60) -> Jina Rerank (top 50 -> top 10) -> Response
```

Branch-aware поиск: optional `branch` параметр выбирает конкретный `source_view` вместо `active_view_id`.

**Vector search стратегии:**
- **Narrow mode** — если кандидатов < 10K: exact vector search по prefiltered set `chunk_content_hash`
- **Broad mode** — ANN overfetch (3x → 6x → 10x escalation) → expand в chunks → filter → если всё ещё мало — exact fallback

**Content-level dedup** перед RRF: одна occurrence на уникальный `chunk_content_hash` в рамках view. Tie-break: path ASC, ordinal ASC.

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
| Эмбеддинги | Jina Embeddings v3 / OpenAI / SiliconFlow |
| Реранкинг | Jina Reranker v2 / SiliconFlow |
| AST-парсинг | tree-sitter |
| MCP | @modelcontextprotocol/sdk (stdio) |
| CLI | Commander |
| Конфиг | YAML + Zod-валидация |
| Тесты | Vitest (471+ тестов) |

## See Also

- [Разработка](development.md) — структура проекта, команды разработки
- [Конфигурация](configuration.md) — параметры поиска (веса, topK, RRF)
