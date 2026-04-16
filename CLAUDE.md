# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local RAG — персональная система семантического поиска по коду и документации. Индексирует локальные папки и Git-репозитории, предоставляет hybrid search (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов (Claude Code, Cursor).

Полная спецификация: `local-rag-spec-new.md`

**Статус:** проект в активной разработке. Реализованы фазы 1–10, включая branch-aware индексацию (фаза 10).

## Tech Stack

- **TypeScript (ESM)** — основной язык
- **PostgreSQL (Docker)** — pgvector + tsvector + метаданные в одной БД
- **Embeddings** — провайдеры Jina v3 / OpenAI / SiliconFlow (Qwen3 и др.) через абстракцию `TextEmbedder`
- **Reranker** — провайдеры Jina v2 / SiliconFlow / `none` через абстракцию `Reranker`
- **tree-sitter** — AST-парсинг кода (полноценные queries для TS/JS, fallback для остальных)
- **@modelcontextprotocol/sdk** — MCP stdio сервер
- **YAML (rag.config.yaml)** — конфигурация с Zod-валидацией

## Architecture

Два процесса, одна БД:

1. **CLI (`src/cli.ts`)** — индексация: source -> chunk -> embed -> store в PostgreSQL. Запускается вручную, завершается после индексации.
2. **MCP Server (`src/mcp-entry.ts`)** — поиск: 4 инструмента (search, read_source, list_sources, status). Запускается Claude Code/Cursor по требованию через stdio.

### Модули

| Модуль | Ответственность |
|--------|----------------|
| `src/sources/` | Чтение локальных папок, клонирование Git-репозиториев, фильтрация файлов, snapshot fingerprints |
| `src/chunks/` | Разбиение на фрагменты: tree-sitter (код), заголовки (markdown), fixed-size (текст/pdf) |
| `src/embeddings/` | Генерация векторов. Интерфейс `TextEmbedder`, фабрика по конфигу |
| `src/search/` | Branch-aware hybrid search: BM25 + vector (narrow/broad modes) + RRF fusion + rerank |
| `src/storage/` | PostgreSQL: схема (6 таблиц), миграции 001–005, storage-классы по одному на таблицу |
| `src/mcp/` | MCP stdio сервер + 4 tool-обработчика (search поддерживает `branch` параметр) |
| `src/indexer/` | Branch-aware индексация: snapshot detection, view reconciliation, blob/content dedup, прогресс |
| `src/export/` | Export/import v2: manifest, archive (tar.gz), SQL exporter/importer (6 таблиц), sanitizer |
| `src/config/` | Zod-схема конфига, загрузка YAML, дефолты |

### Search Pipeline

```
Query -> resolve active_view_id (per source) -> embed query
  -> parallel [BM25 (tsvector, top 50) + Vector (narrow/broad, top 50)]
  -> content-level dedup (per chunk_content_hash) -> RRF Fusion (k=60)
  -> Rerank (top 50 -> top 10) -> Response
```

Branch-aware: optional `branch` parameter в MCP `search` tool выбирает конкретный `source_view` вместо `active_view_id`. Vector search использует narrow mode (exact по prefiltered set) если кандидатов < 10K, иначе broad mode (ANN + escalation + fallback).

### Key Interfaces

- `TextEmbedder` — абстракция эмбеддингов (`embed(input)`, `dimensions`)
- `Reranker` — абстракция реранкера (`rerank(query, documents, topK)`)
- `Chunker` — абстракция чанкера (`chunk(file)`, `supports(filePath)`). `ChunkDispatcher` выбирает chunker по расширению
- `Chunk` / `ChunkMetadata` — модель фрагмента с координатами, зависящими от sourceType (code/markdown/text/pdf)

## Build & Run Commands

```bash
npm run build           # Сборка TypeScript
npm run lint            # ESLint
npm test                # Запуск тестов
npm run typesCheck      # Проверка типов

# CLI.
rag init                # Инициализация БД (миграции)
rag index --path <dir>  # Индексация папки
rag index --all         # Индексация всех источников из конфига
rag status              # Статус системы
rag list                # Список источников
rag remove <name>       # Удаление источника
rag export --all        # Экспорт всех источников в .tar.gz (формат v2)
rag import <file> --all # Импорт из архива (только v2; v1 отклоняется)
rag re-embed            # Генерация эмбеддингов для NULL чанков (через chunk_contents)
rag gc                  # Очистка orphan file_blobs и chunk_contents
```

## Database

PostgreSQL с расширением pgvector. Шесть таблиц (миграции 001–005):

- `sources` — логические источники (name, type, path/git_url, repo_root_path, repo_subpath, active_view_id)
- `source_views` — branch/workspace снимки источника (view_kind, ref_name, head_commit_oid, snapshot_fingerprint, chunk_count)
- `file_blobs` — тела файлов с дедупликацией по content_hash (единое хранилище для snapshot reads)
- `indexed_files` — файлы внутри view (source_view_id, path, content_hash → file_blobs)
- `chunk_contents` — дедуплицированные тела чанков с `embedding vector(N)` и `search_vector tsvector` (generated)
- `chunks` — occurrence-level строки (source_view_id, indexed_file_id, chunk_content_hash, path, ordinal, координаты)

HNSW-индекс на `chunk_contents.embedding`, GIN-индекс на `chunk_contents.search_vector`. Размерность вектора зависит от провайдера (Jina v3: 1024, OpenAI text-embedding-3-small: 1536, SiliconFlow Qwen3-Embedding-0.6B: 1024). После destructive migration 005 требуется полная переиндексация (`rag index --all`).

## Configuration

Файл `rag.config.yaml` (или `~/.config/rag/config.yaml`):
- `database` — подключение к PostgreSQL
- `embeddings` — провайдер (`jina` / `openai` / `siliconflow`), API ключи через `${ENV_VAR}`
- `reranker` — провайдер (`jina` / `siliconflow` / `none`)
- `search` — веса BM25/vector, RRF k, topK параметры
- `sources` — список источников с include/exclude паттернами
- `indexing` — размер чанков, overlap, директория для git-клонов

## Implementation Phases

1. **Ядро** — конфиг, PostgreSQL, markdown/fixed chunking, embeddings (Jina), hybrid search, CLI (init, index)
2. **MCP + rerank** — reranker (Jina), MCP stdio сервер с 4 инструментами, инкрементальная индексация
3. **Код** — tree-sitter chunker (TS/JS), fallback chunker, Git-источники
4. **Полировка** — .gitignore/.ragignore фильтрация, CLI (list, remove, прогресс), OpenAI embedder
5. **Рефакторинг экстракторов** — ts-extractor, extractor-types, languages с graceful degradation
6. **Java tree-sitter** — java-extractor с FQN, Javadoc, аннотациями
7. **Kotlin tree-sitter** — kotlin-extractor с extension functions, companion objects
8. **Config path resolution** — --config, RAG_CONFIG, resolveConfigPath
9. **Export/Import/Re-embed** — backup/restore, перенос данных, перегенерация эмбеддингов
10. **Branch-aware indexing** — source_views, file_blobs, chunk_contents; branch/workspace snapshots; narrow/broad vector search; rag gc; export/import v2

## MCP Servers

### Context7

Используй Context7 MCP (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`) когда нужна документация по библиотекам/API, примеры кода, инструкции по настройке — без явного запроса от пользователя.

### local-rag

Используй local-rag MCP (`mcp__local-rag__search`, `mcp__local-rag__read_source`, `mcp__local-rag__list_sources`, `mcp__local-rag__status`) для поиска по проиндексированным кодовым базам и документации.

**Важно: запросы к local-rag формулируй на английском языке.** BM25 + vector search работают лучше с английскими запросами. Даже если пользователь задаёт вопрос на русском — переведи суть запроса на английский перед вызовом `mcp__local-rag__search`.

Пример:
- Пользователь: «Как работает авторизация в KariPos?»
- Запрос к local-rag: `query: "authentication authorization login flow"`
