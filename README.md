# Local RAG

**Персональная система семантического поиска по коду и документации.**

Индексирует локальные папки и Git-репозитории, предоставляет гибридный поиск (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов — Claude Code, Cursor и других MCP-совместимых клиентов.

## Возможности

- **Hybrid search** — объединяет полнотекстовый BM25 и векторный поиск через Reciprocal Rank Fusion
- **AST-aware chunking** — tree-sitter разбивает код на семантические блоки (функции, классы, методы), а не на произвольные строки
- **Инкрементальная индексация** — SHA-256 хэши файлов, переиндексируются только изменённые файлы
- **MCP-сервер** — 4 инструмента для AI-агентов: `search`, `read_source`, `list_sources`, `status`
- **Git-источники** — автоматическое клонирование/обновление репозиториев
- **Фильтрация** — учитывает `.gitignore`, поддерживает `.ragignore`, include/exclude паттерны
- **Переключаемые провайдеры** — Jina Embeddings v3, OpenAI, Jina Reranker v2

## Quick Start

### 1. Требования

- Node.js >= 18
- Docker (для PostgreSQL)
- API-ключ [Jina AI](https://jina.ai/embeddings/) или [OpenAI](https://platform.openai.com/)

### 2. Установка

```bash
git clone <repo-url> local-rag
cd local-rag
npm install
npm run build
npm install -g .
```

> **Почему `npm install -g .`?** Пакет не опубликован в npm-реестре, поэтому `npx rag` не работает из других директорий — npx не находит пакет. Глобальная установка из локальной папки (`.`) регистрирует команду `rag` в системе и делает её доступной из любого места.

### 3. PostgreSQL

```bash
docker compose up -d
```

Поднимает PostgreSQL 16 с расширением pgvector. Данные сохраняются в Docker volume `pgdata`.

### 4. Настройка окружения

```bash
cp .env.example .env
```

Укажите API-ключ в `.env`:

```
JINA_API_KEY=your_jina_api_key_here
```

### 5. Инициализация БД

```bash
npx rag init
```

Создаёт таблицы `sources`, `chunks`, `indexed_files` и необходимые индексы (HNSW, GIN).

### 6. Индексация

```bash
# Локальная папка.
npx rag index --path ./my-project --name my-project

# Git-репозиторий.
npx rag index --git https://github.com/user/repo --name repo

# Все источники из конфига.
npx rag index --all
```

### 7. Подключение MCP-сервера

После индексации подключите MCP-сервер к вашему AI-агенту (см. раздел [MCP-интеграция](#mcp-integration)).

## CLI-команды

| Команда | Описание |
|---------|----------|
| `rag init` | Инициализация БД (миграции) |
| `rag index --path <dir>` | Индексация локальной папки |
| `rag index --git <url>` | Индексация Git-репозитория |
| `rag index --all` | Индексация всех источников из конфига |
| `rag index <name>` | Индексация конкретного источника из конфига |
| `rag list` | Список проиндексированных источников |
| `rag remove <name>` | Удаление источника и всех его чанков |
| `rag status` | Статус системы: БД, провайдеры, статистика |

### Опции index

| Опция | Описание |
|-------|----------|
| `-p, --path <dir>` | Путь к локальной директории |
| `-g, --git <url>` | URL Git-репозитория |
| `-b, --branch <branch>` | Git-ветка (по умолчанию: `main`) |
| `-n, --name <name>` | Имя источника |
| `-a, --all` | Индексировать все источники из конфига |
| `-c, --config <path>` | Путь к файлу конфигурации |

## Конфигурация

Файл `rag.config.yaml` (или `~/.config/rag/config.yaml`):

```yaml
database:
  host: localhost
  port: 5432
  name: local_rag
  user: rag
  password: rag

embeddings:
  provider: jina                    # jina | openai
  jina:
    apiKey: ${JINA_API_KEY}         # Подстановка переменных окружения
    model: jina-embeddings-v3
    dimensions: 1024

reranker:
  provider: jina                    # jina | none
  jina:
    apiKey: ${JINA_API_KEY}
    model: jina-reranker-v2-base-multilingual

search:
  bm25Weight: 0.4                   # Вес BM25 в RRF
  vectorWeight: 0.6                 # Вес векторного поиска
  retrieveTopK: 50                  # Сколько результатов брать из каждого канала
  finalTopK: 10                     # Финальное количество результатов
  rrf:
    k: 60                           # Параметр RRF fusion

sources:
  - name: my-project
    type: local
    path: /path/to/project
    include: ['**/*.ts', '**/*.md']
    exclude: ['**/node_modules/**', '**/dist/**']

  - name: some-lib
    type: git
    url: https://github.com/user/some-lib
    branch: main
    include: ['src/**/*.ts']

indexing:
  chunkSize:
    maxTokens: 1000                 # Макс. размер чанка в токенах
    overlap: 100                    # Перекрытие между чанками
  git:
    cloneDir: ~/.local/share/rag/repos  # Куда клонировать Git-репозитории
```

### Путь к конфигу

Конфиг ищется в следующем порядке:

| Приоритет | Источник | При отсутствии файла |
|-----------|----------|---------------------|
| 0 | `--config <path>` (CLI / MCP-сервер) | ошибка с указанием пути |
| 1 | `RAG_CONFIG=<path>` (переменная окружения) | ошибка с указанием пути |
| 2 | `./rag.config.yaml` (текущая директория) | продолжить поиск |
| 3 | `~/.config/rag/config.yaml` | продолжить поиск |
| — | Ничего не найдено | дефолтные значения |

`RAG_CONFIG` удобен при запуске MCP-сервера как глобального инструмента, когда рабочая директория принадлежит другому проекту:

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

### Переменные окружения

В `apiKey` поддерживается синтаксис `${ENV_VAR}` — значение берётся из переменной окружения.

### Провайдеры эмбеддингов

| Провайдер | Модель по умолчанию | Размерность | Нужен ключ |
|-----------|---------------------|-------------|------------|
| `jina` | `jina-embeddings-v3` | 1024 | `JINA_API_KEY` |
| `openai` | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |

### Фильтрация файлов

При индексации файлы фильтруются в таком порядке:

1. `.gitignore` — если директория является Git-репозиторием
2. `.ragignore` — аналогичный формат, специфичный для RAG
3. `include` / `exclude` из конфигурации источника
4. Бинарные файлы пропускаются автоматически

Пример `.ragignore`:

```
# Исключить тестовые файлы.
**/__tests__/**
**/*.test.ts

# Исключить сгенерированное.
dist/
*.min.js
```

## <a name="mcp-integration"></a>MCP-интеграция

### Claude Code

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

### Cursor

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

### MCP-инструменты

| Инструмент | Описание |
|------------|----------|
| `search` | Гибридный семантический поиск. Параметры: `query`, `topK` (1-100, по умолчанию 10), `sourceId`, `sourceType` (code/markdown/text/pdf), `pathPrefix` |
| `read_source` | Чтение фрагмента источника по `chunkId`, по координатам (`sourceName` + `path` + `startLine`/`endLine`) или по заголовку (`headerPath`). Возвращает структурированный JSON |
| `list_sources` | Список проиндексированных источников. Фильтры: `sourceType` (local/git), `pathPrefix`, `limit` |
| `status` | Статус системы: `schemaVersion`, `totalSources`/`totalChunks`, провайдеры, `lastIndexedAt` |

## Архитектура

```
                   rag.config.yaml
                        |
          +-------------+-------------+
          |                           |
     CLI (rag)                  MCP Server
     index/list/                search/read/
     remove/status              list/status
          |                           |
          +-------------+-------------+
                        |
                   PostgreSQL
              pgvector + tsvector
```

Два процесса, одна БД:

- **CLI** — индексация: source -> scan -> chunk -> embed -> store. Запускается вручную, завершается после работы.
- **MCP Server** — поиск: принимает запросы через stdio, выполняет hybrid search, возвращает результаты. Запускается AI-клиентом автоматически.

### Search Pipeline

```
Query -> embed -> parallel [BM25 (tsvector, top 50), Vector (pgvector cosine, top 50)]
  -> RRF Fusion (k=60) -> Jina Rerank (top 50 -> top 10) -> Response
```

### Chunking

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
| Тесты | Vitest (288 тестов) |

## Разработка

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

### Структура проекта

```
src/
  cli.ts                    # CLI entry point (Commander)
  mcp-entry.ts              # MCP server entry point
  config/                   # Zod-схемы, YAML-загрузчик, дефолты
  commands/                 # init, index, list, remove, status
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

## License

MIT
