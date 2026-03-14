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
| `rag re-embed` | Генерация эмбеддингов для чанков с NULL embedding |

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

Формат архива: `.tar.gz` с `manifest.json`, `config.yaml` (санитизированный, без секретов) и SQL-файлами для каждого источника.

### rag import

```bash
rag import backup.tar.gz                    # Интерактивный выбор
rag import backup.tar.gz --all              # Все источники из архива
rag import backup.tar.gz --force            # Перезаписать без вопросов
rag import backup.tar.gz --remap-path /old=/new  # Замена базового пути
```

При импорте проверяется совпадение версии схемы БД. Если источник уже существует — запрашивается подтверждение (или `--force`).

### rag re-embed

```bash
rag re-embed                       # Все чанки с NULL embedding
rag re-embed --source my-project   # Только конкретный источник
rag re-embed --force               # Перегенерировать ВСЕ (включая существующие)
```

Типичные сценарии: после импорта с `--no-embeddings`, при смене провайдера (Jina -> OpenAI) через `--force`.

## See Also

- [Конфигурация](configuration.md) — настройка rag.config.yaml
- [MCP-интеграция](mcp-integration.md) — подключение к AI-агентам
