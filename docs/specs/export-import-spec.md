# Спецификация: Export / Import / Re-embed

## 1. Обзор

Три новые CLI-команды для local-rag:
- **`rag export`** — экспорт данных БД + конфига в портативный архив
- **`rag import`** — импорт данных из архива в существующую БД
- **`rag re-embed`** — генерация эмбеддингов для чанков с NULL embedding

### Мотивация
- Backup/restore на той же машине (disaster recovery)
- Перенос готовой проиндексированной базы на другую машину / другому разработчику (sharing)

## 2. Формат данных

### 2.1 Единый формат COPY+SQL

Все операции экспорта/импорта используют **SQL через postgres-клиент** (библиотека `postgres`). Нет зависимости от внешних утилит (pg_dump, pg_restore).

Данные экспортируются SQL-запросами с фильтрацией по `source_id`, записываются как INSERT-стейтменты.

### 2.2 Структура архива (.tar.gz)

```
rag-export-<date>.tar.gz
├── manifest.json          # Метаданные дампа
├── config.yaml            # Санитизированный конфиг
└── data/
    ├── <source-name-1>.sql  # INSERT-стейтменты для source + chunks + indexed_files
    ├── <source-name-2>.sql
    └── ...
```

### 2.3 manifest.json

```json
{
  "version": 1,
  "schemaVersion": 3,
  "createdAt": "2026-02-27T12:00:00Z",
  "localRagVersion": "0.1.0",
  "sources": [
    {
      "name": "karipos",
      "type": "local",
      "path": "/Users/zajcevdmitrij/Work_folder/Kari/KariPos-APP.UI",
      "chunksCount": 17990,
      "hasEmbeddings": true
    }
  ],
  "includesEmbeddings": true,
  "includesConfig": true
}
```

- `version` — версия формата архива (для будущей совместимости)
- `schemaVersion` — номер последней миграции БД на момент экспорта. При импорте сверяется с текущей версией БД. При несовпадении — ошибка с подсказкой

### 2.4 Санитизация конфига

При экспорте `rag.config.yaml`:
- Значения, содержащие резолвленные env-переменные, заменяются обратно на `${ENV_VAR}` плейсхолдеры
- Пароли БД и API-ключи НЕ попадают в архив в открытом виде
- Предупреждение пользователю: `"Config sanitized. Review config.yaml before sharing."`

## 3. Команда: rag export

### 3.1 Синтаксис

```bash
rag export                    # Интерактивный выбор источников
rag export --all              # Все источники
rag export --source <name>    # Конкретные источники (повторяемый флаг)
rag export --dry-run          # Показать сводку без экспорта
rag export --no-embeddings    # Без эмбеддингов (компактный файл)
rag export --no-compress      # Без gzip-сжатия
rag export --output <path>    # Путь к выходному файлу
```

### 3.2 Интерактивный режим

Без `--all` и `--source` — показать список источников с чекбоксами (@inquirer/prompts, checkbox prompt).

Пример:

```
? Select sources to export:
  ◉ karipos (17990 chunks, 45 MB)
  ◯ local-rag-docs (320 chunks, 1.2 MB)
  ◯ my-lib (890 chunks, 3.4 MB)
```

### 3.3 --dry-run

Показать сводку без реального экспорта:

```
Export summary:
  Sources: karipos (17990 chunks), local-rag-docs (320 chunks)
  Embeddings: included (~70 MB)
  Config: included (sanitized)
  Estimated size: ~85 MB (compressed: ~25 MB)
```

### 3.4 Алгоритм экспорта

1. Загрузить конфиг, подключиться к БД
2. Определить источники (интерактивно / --all / --source)
3. Если --dry-run — показать сводку, завершить
4. Создать tmp-директорию
5. Для каждого источника:
   a. Выгрузить запись из `sources` (INSERT)
   b. Выгрузить `chunks` WHERE source_id = ? (INSERT, с/без embedding в зависимости от --no-embeddings)
   c. Выгрузить `indexed_files` WHERE source_id = ? (INSERT)
   d. Записать в `data/<source-name>.sql`
   e. Обновить прогресс-бар
6. Сформировать manifest.json
7. Санитизировать и включить config.yaml
8. Упаковать в .tar.gz (или .tar если --no-compress)
9. Показать итог: путь к файлу, размер, список экспортированных источников

### 3.5 Имя выходного файла

По умолчанию: `./rag-export-<YYYY-MM-DD-HHmmss>.tar.gz`

С `--output <path>`: указанный путь.

### 3.6 Прогресс

ConsoleProgress (аналогично index) — полоска с счётчиком чанков:

```
Exporting karipos... [████████░░] 12000/17990 chunks
```

## 4. Команда: rag import

### 4.1 Синтаксис

```bash
rag import <file>              # Интерактивный выбор источников из архива
rag import <file> --all        # Все источники из архива
rag import <file> --source <n> # Конкретные источники из архива
rag import <file> --force      # Перезаписать существующие без вопросов
rag import <file> --remap-path /old=/new  # Замена базового пути
```

### 4.2 Предусловия

- `rag init` должен быть выполнен (таблицы и расширения созданы)
- Версия схемы БД должна совпадать с `schemaVersion` из manifest.json

### 4.3 Проверка версии

При импорте:
1. Прочитать manifest.json
2. Сравнить `schemaVersion` с текущей версией БД (из таблицы миграций)
3. Если не совпадает — ошибка:
   ```
   Error: Schema version mismatch.
   Dump schema: 3, Current DB schema: 2.
   Run 'rag init' to apply pending migrations.
   ```

### 4.4 Конфликты (существующие источники)

При обнаружении существующего источника с таким же именем:

**Без --force:**
```
Source 'karipos' already exists (17990 chunks).
? Overwrite with imported data? (y/N)
```

**С --force:** перезаписать без вопросов.

Перезапись: DELETE chunks + indexed_files WHERE source_id = ?, DELETE source, затем INSERT новых данных. Всё в одной транзакции.

### 4.5 --remap-path

Заменяет базовый путь в:
- `sources.path` (для local-источников)
- `chunks.metadata->>'path'` (путь к файлу в метаданных)

Формат: `--remap-path /old/base/path=/new/base/path`

Замена — простой string replace префикса.

### 4.6 Предупреждение о путях

Если local-источник содержит путь, которого нет на текущей машине:

```
Warning: Source 'karipos' references path '/Users/zajcevdmitrij/Work_folder/Kari/KariPos-APP.UI'
which does not exist on this machine.
Search will work (data is in DB), but 'read_source' won't be able to read files.
Use --remap-path to update paths.
```

### 4.7 Атомарность

Каждый источник импортируется в **отдельной транзакции**:
- Если импорт прерван на полпути — уже импортированные источники остаются
- Текущий (незавершённый) — откатывается
- Оставшиеся — не импортированы

### 4.8 Алгоритм импорта

1. Распаковать архив во tmp-директорию
2. Прочитать manifest.json, проверить version и schemaVersion
3. Определить источники (интерактивно / --all / --source)
4. Для каждого выбранного источника:
   a. Проверить конфликт (source с таким именем уже есть?)
   b. Если конфликт — спросить / --force
   c. Если --remap-path — подготовить замену путей
   d. BEGIN транзакция
   e. Если конфликт и перезапись — удалить старые данные
   f. Выполнить SQL из `data/<source-name>.sql`
   g. Если --remap-path — UPDATE пути
   h. COMMIT
   i. Обновить прогресс-бар
5. Если есть config.yaml и пользователь хочет — скопировать (спросить)
6. Показать итог

### 4.9 Импорт конфига

При наличии config.yaml в архиве:
```
? Import config.yaml? This will overwrite your current rag.config.yaml. (y/N)
```

С `--force` — не спрашивать, не перезаписывать (конфиг — только по явному запросу).

## 5. Команда: rag re-embed

### 5.1 Синтаксис

```bash
rag re-embed                   # Все чанки с NULL embedding
rag re-embed --source <name>   # Только указанный источник
rag re-embed --force           # Перегенерировать ВСЕ эмбеддинги (включая существующие)
```

### 5.2 Сценарии использования

1. После `rag import` файла экспортированного с `--no-embeddings`
2. При смене embedding-провайдера (Jina → OpenAI) — `--force`
3. После ошибки при индексации (частично сгенерированные эмбеддинги)

### 5.3 Алгоритм

1. Загрузить конфиг, создать TextEmbedder
2. Определить scope:
   - По умолчанию: `SELECT * FROM chunks WHERE embedding IS NULL`
   - С `--source`: + `AND source_id = ?`
   - С `--force`: убрать условие `IS NULL` (все чанки)
3. Батчами (аналогично Indexer):
   a. Загрузить N чанков
   b. Сгенерировать эмбеддинги через TextEmbedder
   c. UPDATE chunks SET embedding = ? WHERE id = ?
   d. Обновить прогресс-бар
4. Показать итог: количество обработанных чанков

### 5.4 Прогресс

```
Re-embedding karipos... [████████░░] 12000/17990 chunks
```

## 6. Зависимости

### Новые npm-зависимости

- `@inquirer/prompts` — интерактивный выбор источников (checkbox)

### Системные зависимости

Никаких (без pg_dump/pg_restore).

## 7. Структура файлов

```
src/commands/
├── export-cmd.ts        # CLI-команда rag export
├── import-cmd.ts        # CLI-команда rag import
└── re-embed-cmd.ts      # CLI-команда rag re-embed

src/export/
├── exporter.ts          # Логика экспорта (query → SQL → archive)
├── importer.ts          # Логика импорта (archive → SQL → execute)
├── manifest.ts          # Чтение/запись manifest.json
├── sanitizer.ts         # Санитизация конфига
└── archive.ts           # Упаковка/распаковка tar.gz (node:zlib + tar)
```

### Обновления существующих файлов

- `src/cli.ts` — три новые команды (export, import, re-embed)
- `package.json` — зависимость @inquirer/prompts

## 8. SQL-формат данных

### 8.1 Файл data/<source-name>.sql

```sql
-- Source: karipos
-- Exported: 2026-02-27T12:00:00Z

-- Source record
INSERT INTO sources (id, name, type, path, git_url, created_at, updated_at)
VALUES ('uuid', 'karipos', 'local', '/path/to/source', NULL, '...', '...');

-- Chunks (17990 records)
INSERT INTO chunks (id, source_id, content, metadata, embedding, search_vector)
VALUES ('uuid', 'source-uuid', 'content...', '{"path": "..."}', '[0.1, 0.2, ...]', NULL);
-- ... (по одному INSERT на чанк)

-- Indexed files (6055 records)
INSERT INTO indexed_files (id, source_id, file_path, content_hash, indexed_at)
VALUES ('uuid', 'source-uuid', 'src/app.ts', 'sha256...', '...');
```

### 8.2 Эмбеддинги

- С `--no-embeddings`: поле `embedding` = `NULL`
- Без флага: полный вектор `[0.1, 0.2, ..., 0.9]` (1024 float)

### 8.3 search_vector

`search_vector` — generated column (tsvector), не экспортируется. PostgreSQL пересчитает автоматически при INSERT.

## 9. Обработка ошибок

| Ситуация | Поведение |
|----------|-----------|
| БД недоступна | Ошибка с подсказкой проверить подключение |
| Источник не найден (--source) | Ошибка со списком доступных |
| Архив повреждён | Ошибка при распаковке |
| Несовпадение schemaVersion | Ошибка с подсказкой запустить `rag init` |
| Нет места на диске | Ошибка от ОС (не обрабатываем специально) |
| Прерывание (Ctrl+C) | Текущая транзакция откатывается, уже импортированные остаются |

## 10. Ограничения и будущие улучшения

- Нет инкрементального экспорта (только полный снимок источника)
- Нет шифрования архива (пользователь может зашифровать внешними средствами)
- re-embed не поддерживает изменение размерности вектора (нужна миграция БД)
- Нет автоматического планирования бэкапов (cron — ответственность пользователя)
