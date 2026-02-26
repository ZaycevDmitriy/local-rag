# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local RAG — персональная система семантического поиска по коду и документации. Индексирует локальные папки и Git-репозитории, предоставляет hybrid search (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов (Claude Code, Cursor).

Полная спецификация: `local-rag-spec-new.md`

**Статус:** greenfield-проект, реализация по фазам из спецификации (раздел 14).

## Tech Stack

- **TypeScript (ESM)** — основной язык
- **PostgreSQL (Docker)** — pgvector + tsvector + метаданные в одной БД
- **Jina Embeddings v3** — эмбеддинги (1024d), абстракция `TextEmbedder` для смены провайдера
- **Jina Reranker v2** — переранжирование результатов
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
| `src/sources/` | Чтение локальных папок и клонирование Git-репозиториев, фильтрация файлов |
| `src/chunks/` | Разбиение на фрагменты: tree-sitter (код), заголовки (markdown), fixed-size (текст/pdf) |
| `src/embeddings/` | Генерация векторов. Интерфейс `TextEmbedder`, фабрика по конфигу |
| `src/search/` | Hybrid search: BM25 + vector + RRF fusion + rerank. `SearchCoordinator` оркестрирует pipeline |
| `src/storage/` | PostgreSQL: схема, миграции, CRUD для chunks и sources |
| `src/mcp/` | MCP stdio сервер + 4 tool-обработчика |
| `src/indexer/` | Оркестрация индексации, инкрементальность (hash-сравнение), прогресс |
| `src/config/` | Zod-схема конфига, загрузка YAML, дефолты |

### Search Pipeline

```
Query -> embed query -> parallel [BM25 (tsvector, top 50) + Vector (pgvector cosine, top 50)]
  -> RRF Fusion (k=60) -> Jina Rerank (top 50 -> top 10) -> Response
```

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
```

## Database

PostgreSQL с расширением pgvector. Три таблицы:

- `sources` — источники данных (name, type, path/git_url)
- `chunks` — фрагменты с `embedding vector(1024)` и `search_vector tsvector` (generated column)
- `indexed_files` — хэши файлов для инкрементальной индексации (SHA-256)

HNSW-индекс на `embedding`, GIN-индекс на `search_vector`. Размерность вектора зависит от провайдера (Jina: 1024, OpenAI: 1536).

## Configuration

Файл `rag.config.yaml` (или `~/.config/rag/config.yaml`):
- `database` — подключение к PostgreSQL
- `embeddings` — провайдер (jina/openai/self-hosted), API ключи через `${ENV_VAR}`
- `reranker` — провайдер (jina/none)
- `search` — веса BM25/vector, RRF k, topK параметры
- `sources` — список источников с include/exclude паттернами
- `indexing` — размер чанков, overlap, директория для git-клонов

## Implementation Phases

1. **Ядро** — конфиг, PostgreSQL, markdown/fixed chunking, Jina embeddings, hybrid search, CLI (init, index)
2. **MCP + rerank** — Jina reranker, MCP stdio сервер с 4 инструментами, инкрементальная индексация
3. **Код** — tree-sitter chunker (TS/JS), fallback chunker, Git-источники
4. **Полировка** — .gitignore/.ragignore фильтрация, CLI (list, remove, прогресс), OpenAI embedder

## MCP

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
