# Local RAG

[![CI](https://github.com/ZaycevDmitriy/local-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/ZaycevDmitriy/local-rag/actions/workflows/ci.yml)

> Персональная система семантического поиска по коду и документации.

Индексирует локальные папки и Git-репозитории, предоставляет гибридный поиск (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов — Claude Code, Cursor и других MCP-совместимых клиентов.

## Возможности

- **Hybrid search** — BM25 + векторный поиск через Reciprocal Rank Fusion + Jina Reranker
- **AST-aware chunking** — tree-sitter разбивает код на семантические блоки (функции, классы, методы)
- **Инкрементальная индексация** — SHA-256 хэши, переиндексируются только изменённые файлы
- **MCP-сервер** — 4 инструмента для AI-агентов: `search`, `read_source`, `list_sources`, `status`
- **Переключаемые провайдеры** — Jina, OpenAI, SiliconFlow для embeddings; Jina и SiliconFlow для rerank
- **Export / Import** — портативный backup в `.tar.gz`, перенос данных, re-embed при смене провайдера

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
# Укажите JINA_API_KEY в .env

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

---

## Документация

| Раздел | Описание |
|--------|----------|
| [CLI-команды](docs/cli.md) | Полная справка по всем командам |
| [Конфигурация](docs/configuration.md) | rag.config.yaml, провайдеры, фильтрация |
| [MCP-интеграция](docs/mcp-integration.md) | Подключение к Claude Code, Cursor |
| [Архитектура](docs/architecture.md) | Search pipeline, chunking, tech stack |
| [Разработка](docs/development.md) | Структура проекта, команды разработки |

## License

MIT
