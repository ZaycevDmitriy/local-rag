[Back to README](../README.md) · [Конфигурация →](configuration.md)

# CLI-команды

## Основные команды

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
| `rag export` | Экспорт источников в портативный архив (.tar.gz) |
| `rag import <file>` | Импорт источников из архива |
| `rag re-embed` | Генерация эмбеддингов для chunk_contents с NULL embedding |
| `rag gc` | Очистка orphan file_blobs и chunk_contents (grace period) |

## Опции index

| Опция | Описание |
|-------|----------|
| `-p, --path <dir>` | Путь к локальной директории |
| `-g, --git <url>` | URL Git-репозитория |
| `-b, --branch <branch>` | Git-ветка (по умолчанию: `main`) |
| `-n, --name <name>` | Имя источника |
| `-a, --all` | Индексировать все источники из конфига |
| `-c, --config <path>` | Путь к файлу конфигурации |

## Export / Import / Re-embed

### rag export

```bash
rag export                         # Интерактивный выбор источников
rag export --all                   # Все источники
rag export --source my-project     # Конкретный источник
rag export --dry-run               # Показать сводку без экспорта
rag export --no-embeddings         # Без эмбеддингов (компактный файл)
rag export --no-compress           # Без gzip-сжатия (.tar)
rag export --output backup.tar.gz  # Путь к выходному файлу
```

Формат архива v2: `.tar.gz` с `manifest.json` (version: 2), `config.yaml` (санитизированный, без секретов) и SQL-файлами для 6 таблиц каждого источника (sources, source_views, file_blobs, indexed_files, chunk_contents, chunks).

### rag import

```bash
rag import backup.tar.gz                    # Интерактивный выбор
rag import backup.tar.gz --all              # Все источники из архива
rag import backup.tar.gz --force            # Перезаписать без вопросов
rag import backup.tar.gz --remap-path /old=/new  # Замена базового пути
```

При импорте проверяется совпадение версии схемы БД. Архивы v1 отклоняются с рекомендацией переиндексации. Если источник уже существует — запрашивается подтверждение (или `--force`).

### rag re-embed

```bash
rag re-embed                       # Все chunk_contents с NULL embedding
rag re-embed --source my-project   # Только конкретный источник
rag re-embed --force               # Перегенерировать ВСЕ (включая существующие)
```

Работает через `ChunkContentStorage` — генерирует эмбеддинги для дедуплицированных `chunk_contents`, а не для individual chunk rows. Типичные сценарии: после импорта с `--no-embeddings`, при смене провайдера (Jina -> OpenAI) через `--force`.

### rag gc

```bash
rag gc                             # Очистка orphan file_blobs и chunk_contents
```

Удаляет `file_blobs` и `chunk_contents`, на которые нет ссылок из `indexed_files` и `chunks` соответственно. Применяет grace period для защиты от гонок с активной индексацией. Запускать периодически после удаления источников или индексации новых веток.

## See Also

- [Конфигурация](configuration.md) — настройка rag.config.yaml
- [MCP-интеграция](mcp-integration.md) — подключение к AI-агентам
