# Local RAG

[![CI](https://github.com/ZaycevDmitriy/local-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/ZaycevDmitriy/local-rag/actions/workflows/ci.yml)

> Персональная система семантического поиска по коду и документации.

Индексирует локальные папки и Git-репозитории, предоставляет гибридный поиск (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов — Claude Code, Cursor и других MCP-совместимых клиентов.

## Возможности

- **Branch-aware индексация** — независимые снимки по git-веткам с дедупликацией контента и эмбеддингов
- **Hybrid search** — BM25 + векторный поиск (narrow/broad modes) через RRF fusion + reranker
- **AI-powered summarization** — LLM-генерирует English-summary для чанков и включает 3-way поиск (BM25 + vec-content + vec-summary)
- **AST-aware chunking** — tree-sitter разбивает код на семантические блоки (функции, классы, методы)
- **MCP-сервер** — 4 инструмента для AI-агентов с поддержкой `branch` параметра для поиска по веткам
- **Переключаемые провайдеры** — Jina, OpenAI, SiliconFlow для embeddings; Jina, SiliconFlow и `none` для rerank
- **Export / Import v2** — портативный backup в `.tar.gz` (6-table schema), re-embed при смене провайдера
- **Garbage collection** — `rag gc` для очистки orphan blobs после удаления веток

## Quick Start

```bash
# Установка.
git clone <repo-url> local-rag
cd local-rag
npm install
npm run build
npm install -g .

# PostgreSQL.
docker compose up -d

# Настройка.
cp .env.example .env
# Укажите ключ выбранного провайдера в .env (JINA_API_KEY / OPENAI_API_KEY / SILICONFLOW_API_KEY)
# и провайдера в rag.config.yaml (см. docs/configuration.md)

# Инициализация БД.
rag init

# Индексация.
rag index --path ./my-project --name my-project

# Готово — подключите MCP-сервер к AI-агенту.
```

## Пример использования

```bash
# Индексация локальной папки.
rag index --path ./my-project --name my-project

# Индексация Git-репозитория.
rag index --git https://github.com/user/repo --name repo

# Все источники из конфига.
rag index --all

# Статус системы.
rag status
```

## AI-powered summarization

Backfill LLM-summary для чанков и включение 3-way поиска:

```bash
# 1. Отметить источник как opt-in в rag.config.yaml (sources[].summarize: true).

# 2. Оценить стоимость (без обращений к провайдеру).
rag summarize --source karipos --dry-run

# 3. Прогнать backfill (можно частично через --limit, идемпотентен).
rag summarize --source karipos --limit 500

# 4. Включить 3-way в rag.config.yaml: search.useSummaryVector: true.
```

Подробности в спеке [`docs/specs/ai-powered-summarization.md`](docs/specs/ai-powered-summarization.md).

### Опции `rag summarize`

| Опция | Описание |
|-------|----------|
| `--source <name>` | Имя источника (обязательно; должен иметь `summarize: true`). |
| `--limit <N>` | Обработать не более N chunk_contents за прогон. |
| `--dry-run` | Напечатать cost estimate и skip-rate; запросов к провайдеру нет. |
| `--config <path>` | Альтернативный путь к `rag.config.yaml`. |

---

## Документация

| Раздел | Описание |
|--------|----------|
| [CLI-команды](docs/cli.md) | Полная справка по всем командам |
| [Конфигурация](docs/configuration.md) | rag.config.yaml, провайдеры, фильтрация |
| [MCP-интеграция](docs/mcp-integration.md) | Подключение к Claude Code, Cursor |
| [Архитектура](docs/architecture.md) | Search pipeline, chunking, tech stack |
| [Разработка](docs/development.md) | Структура проекта, команды разработки |
| [AI Factory](docs/ai-factory-workflow.md) | Рабочий процесс разработки с AI |

## License

MIT
