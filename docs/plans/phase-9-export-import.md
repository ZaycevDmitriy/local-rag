# Фаза 9: Export / Import / Re-embed

Цель: три новые CLI-команды (`rag export`, `rag import`, `rag re-embed`) для backup/restore и переноса проиндексированных данных между машинами.

**Предусловие:** фазы 1-8 завершены. CLI работает с 5 командами (init, index, list, remove, status).

**Критерий завершения:** `npm run build && npm run lint && npm test` — зелёные. Экспорт/импорт работает end-to-end.

**Спецификация:** `docs/specs/export-import-spec.md`

---

## Шаг 9.1 — Зависимость @inquirer/prompts

### Задача

Установить `@inquirer/prompts` для интерактивного выбора источников.

### Действия

```bash
npm install @inquirer/prompts
```

### Проверка

- `npm run build` — OK
- `npm run lint` — OK
- `npm test` — все существующие тесты проходят

---

## Шаг 9.2 — manifest.ts

### Задача

Модуль для чтения/записи manifest.json. Zod-схема для валидации.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/manifest.ts` | Создать — Zod-схема, writeManifest, readManifest |
| `src/export/__tests__/manifest.test.ts` | Создать — тесты |

### Интерфейс

```typescript
interface ManifestSource {
  name: string;
  type: 'local' | 'git';
  path: string | null;
  chunksCount: number;
  hasEmbeddings: boolean;
}

interface Manifest {
  version: number;           // 1
  schemaVersion: number;     // Номер последней миграции (3)
  createdAt: string;         // ISO 8601
  localRagVersion: string;   // из package.json
  sources: ManifestSource[];
  includesEmbeddings: boolean;
  includesConfig: boolean;
}

function writeManifest(dir: string, manifest: Manifest): Promise<void>;
function readManifest(dir: string): Promise<Manifest>;
function getSchemaVersion(sql: postgres.Sql): Promise<number>;
```

`getSchemaVersion` — `SELECT COUNT(*) FROM _migrations` → число.

### Тесты

- writeManifest записывает валидный JSON
- readManifest парсит и валидирует
- readManifest бросает на невалидный JSON
- readManifest бросает на отсутствующий файл

---

## Шаг 9.3 — sanitizer.ts

### Задача

Санитизация rag.config.yaml — замена резолвленных значений обратно на `${ENV_VAR}` плейсхолдеры.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/sanitizer.ts` | Создать — sanitizeConfig |
| `src/export/__tests__/sanitizer.test.ts` | Создать — тесты |

### Логика

1. Прочитать исходный YAML-файл как текст (до resolveEnvVars)
2. Скопировать as-is — ${ENV_VAR} плейсхолдеры остаются нерезолвленными
3. Это безопаснее чем пытаться "обратить" резолвленные значения

```typescript
// Копирует конфиг-файл без подстановки env-переменных.
async function sanitizeConfig(configPath: string, outputPath: string): Promise<void>;
```

### Тесты

- Копирует файл с ${ENV_VAR} плейсхолдерами без изменений
- Работает с файлом без плейсхолдеров

---

## Шаг 9.4 — archive.ts

### Задача

Упаковка/распаковка tar.gz архивов. Использовать `node:zlib` + `tar` (npm-пакет) или нативный `node:child_process` с `tar`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/archive.ts` | Создать — packArchive, unpackArchive |
| `src/export/__tests__/archive.test.ts` | Создать — тесты |

### Решение по tar

Использовать npm-пакет `tar` (уже стандарт в Node.js экосистеме, 0 нативных зависимостей).

```bash
npm install tar
npm install -D @types/tar
```

### Интерфейс

```typescript
// Упаковать директорию в .tar.gz (или .tar если compress=false).
async function packArchive(sourceDir: string, outputPath: string, compress: boolean): Promise<void>;

// Распаковать архив в целевую директорию.
async function unpackArchive(archivePath: string, targetDir: string): Promise<void>;
```

### Тесты

- packArchive создаёт .tar.gz файл
- packArchive с compress=false создаёт .tar
- unpackArchive распаковывает и восстанавливает структуру
- roundtrip: pack → unpack → файлы совпадают

---

## Шаг 9.5 — exporter.ts (ядро экспорта)

### Задача

Основная логика экспорта: запрос данных из БД → генерация SQL INSERT → запись файлов.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/exporter.ts` | Создать |
| `src/export/__tests__/exporter.test.ts` | Создать |

### Интерфейс

```typescript
interface ExportOptions {
  sql: postgres.Sql;
  sourceIds: string[];       // UUID выбранных источников
  includeEmbeddings: boolean;
  compress: boolean;
  outputPath: string;
  configPath: string | null; // Путь к rag.config.yaml
  onProgress?: (sourceName: string, current: number, total: number) => void;
}

interface ExportResult {
  archivePath: string;
  sourcesExported: number;
  totalChunks: number;
  fileSizeBytes: number;
}

async function exportData(options: ExportOptions): Promise<ExportResult>;
```

### Алгоритм

1. Создать tmp-директорию (`node:fs/promises` mkdtemp)
2. Создать `data/` поддиректорию
3. Для каждого sourceId:
   a. SELECT source → сформировать INSERT SQL
   b. SELECT chunks WHERE source_id (с/без embedding) → INSERT SQL (батчами для экономии памяти)
   c. SELECT indexed_files WHERE source_id → INSERT SQL
   d. Записать `data/<source-name>.sql`
   e. Вызвать onProgress
4. Сформировать manifest.json (getSchemaVersion + метаданные)
5. Если configPath — sanitizeConfig → config.yaml
6. packArchive(tmpDir, outputPath, compress)
7. Удалить tmpDir
8. Вернуть ExportResult

### Генерация SQL

Отдельная функция для escape значений (строки, числа, null, массивы/JSON, векторы):

```typescript
function escapeValue(value: unknown): string;
function generateInsert(table: string, row: Record<string, unknown>): string;
```

Embedding сериализуется как pgvector литерал: `'[0.1,0.2,...]'::vector`.

### Тесты

- escapeValue корректно экранирует строки (single quotes, backslash)
- escapeValue обрабатывает null, числа, JSON, vector
- generateInsert формирует валидный SQL
- exportData с моками БД (отдельные unit-тесты)

---

## Шаг 9.6 — importer.ts (ядро импорта)

### Задача

Основная логика импорта: распаковка → валидация → выполнение SQL.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/importer.ts` | Создать |
| `src/export/__tests__/importer.test.ts` | Создать |

### Интерфейс

```typescript
interface ImportOptions {
  sql: postgres.Sql;
  archivePath: string;
  sourceNames: string[] | 'all'; // Выбранные источники или все
  force: boolean;                // Перезаписать без вопросов
  remapPath?: { from: string; to: string };
  onProgress?: (sourceName: string, status: 'importing' | 'done' | 'skipped') => void;
  onConflict?: (sourceName: string, chunksCount: number) => Promise<boolean>; // Спросить пользователя
}

interface ImportResult {
  sourcesImported: number;
  sourcesSkipped: number;
  totalChunks: number;
  warnings: string[];        // Предупреждения о путях
}

async function importData(options: ImportOptions): Promise<ImportResult>;
```

### Алгоритм

1. unpackArchive → tmpDir
2. readManifest → проверить version (=1) и schemaVersion (= текущая)
3. Определить SQL-файлы для импорта (all или по sourceNames)
4. Для каждого source SQL-файла:
   a. Проверить конфликт (SELECT source по name)
   b. Если конфликт и !force → вызвать onConflict. Если false → skip
   c. BEGIN
   d. Если конфликт → DELETE indexed_files, DELETE chunks, DELETE sources WHERE name
   e. Выполнить SQL из файла (разбить по `;`, выполнить последовательно)
   f. Если remapPath → UPDATE sources SET path, UPDATE chunks SET metadata
   g. COMMIT
   h. Проверить существование path на диске → warning если нет
5. Удалить tmpDir
6. Вернуть ImportResult

### Выполнение SQL из файла

Читать файл, разбить по строкам с `INSERT INTO`, выполнять батчами через `sql.unsafe()`.

### Тесты

- importData с валидным архивом (mock)
- Проверка schemaVersion mismatch → throw
- Конфликт + force=true → перезапись
- Конфликт + onConflict returns false → skip
- remapPath заменяет пути

---

## Шаг 9.7 — export-cmd.ts (CLI-команда rag export)

### Задача

Commander-команда `rag export` с интерактивным выбором, --dry-run, прогрессом.

### Файлы

| Файл | Действие |
|------|----------|
| `src/commands/export-cmd.ts` | Создать |

### Опции Commander

```typescript
new Command('export')
  .description('Export sources to a portable archive')
  .option('--all', 'Export all sources')
  .option('--source <name...>', 'Export specific sources')
  .option('--dry-run', 'Show export summary without exporting')
  .option('--no-embeddings', 'Exclude embeddings (smaller file)')
  .option('--no-compress', 'Disable gzip compression')
  .option('--output <path>', 'Output file path')
  .option('--config <path>', 'Config file path')
```

### Логика

1. loadConfig → createDb
2. Загрузить все sources из БД (SourceStorage.getAll)
3. Если нет --all и нет --source → интерактивный выбор (@inquirer/prompts checkbox)
4. Если --dry-run → показать сводку (имена, кол-во чанков, оценка размера), exit
5. Сформировать outputPath (--output или `./rag-export-<date>.tar.gz`)
6. Вызвать exportData с ConsoleProgress
7. Показать итог

### Интерактивный выбор

```typescript
import { checkbox } from '@inquirer/prompts';

const selected = await checkbox({
  message: 'Select sources to export:',
  choices: sources.map((s) => ({
    name: `${s.name} (${s.chunk_count} chunks)`,
    value: s.id,
    checked: true,
  })),
});
```

---

## Шаг 9.8 — import-cmd.ts (CLI-команда rag import)

### Задача

Commander-команда `rag import`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/commands/import-cmd.ts` | Создать |

### Опции Commander

```typescript
new Command('import')
  .description('Import sources from an archive')
  .argument('<file>', 'Path to archive file')
  .option('--all', 'Import all sources from archive')
  .option('--source <name...>', 'Import specific sources')
  .option('--force', 'Overwrite existing sources without asking')
  .option('--remap-path <mapping>', 'Remap base path (format: /old=/new)')
  .option('--config <path>', 'Config file path')
```

### Логика

1. loadConfig → createDb
2. Проверить что файл существует
3. Если нет --all и нет --source → прочитать manifest, интерактивный выбор
4. Парсить --remap-path (split по `=`)
5. Вызвать importData с onConflict (confirm prompt из @inquirer/prompts)
6. Если config.yaml в архиве → спросить про импорт конфига
7. Показать итог + warnings

---

## Шаг 9.9 — re-embed-cmd.ts (CLI-команда rag re-embed)

### Задача

Commander-команда `rag re-embed` + логика перегенерации эмбеддингов.

### Файлы

| Файл | Действие |
|------|----------|
| `src/commands/re-embed-cmd.ts` | Создать |
| `src/storage/chunks.ts` | Добавить методы `getWithNullEmbedding` и `updateEmbedding` |

### Новые методы ChunkStorage

```typescript
// Чанки без эмбеддингов (или все при force).
async getChunksForReEmbed(options: {
  sourceId?: string;
  force: boolean;
  limit: number;
  offset: number;
}): Promise<ChunkRow[]>;

// Обновить эмбеддинг одного чанка.
async updateEmbedding(chunkId: string, embedding: number[]): Promise<void>;

// Количество чанков для re-embed.
async countForReEmbed(sourceId?: string, force?: boolean): Promise<number>;
```

### Алгоритм re-embed

1. loadConfig → createDb → createTextEmbedder
2. Определить scope: --source → sourceId, --force → all
3. Подсчитать total (countForReEmbed)
4. Если 0 → "No chunks to re-embed", exit
5. Батчами (BATCH_SIZE = 100):
   a. SELECT chunks (offset, limit)
   b. embed(contents)
   c. UPDATE embedding для каждого chunk
   d. Прогресс-бар
6. Итог: "Re-embedded N chunks"

### Опции Commander

```typescript
new Command('re-embed')
  .description('Generate embeddings for chunks with missing vectors')
  .option('--source <name>', 'Only re-embed specific source')
  .option('--force', 'Re-embed all chunks (including existing)')
  .option('--config <path>', 'Config file path')
```

---

## Шаг 9.10 — Регистрация команд в cli.ts

### Задача

Подключить три новые команды в `src/cli.ts`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/cli.ts` | Добавить import + program.addCommand для export, import, re-embed |

### Изменения

```typescript
import { exportCommand } from './commands/export-cmd.js';
import { importCommand } from './commands/import-cmd.js';
import { reEmbedCommand } from './commands/re-embed-cmd.js';

// ... после существующих addCommand:
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(reEmbedCommand);
```

---

## Шаг 9.11 — Интеграционные тесты

### Задача

End-to-end тесты для export → import roundtrip.

### Файлы

| Файл | Действие |
|------|----------|
| `src/export/__tests__/integration.test.ts` | Создать |

### Тесты

- Export all → import all на чистую БД → данные совпадают
- Export --no-embeddings → import → чанки с NULL embedding
- Export source A → import с конфликтом + force → перезапись
- Export → import с --remap-path → пути обновлены
- Import с неверной schemaVersion → ошибка
- Import повреждённого архива → ошибка

### Примечание

Интеграционные тесты требуют работающую БД. Использовать подход из существующих тестов: тест-утилиты для создания/удаления тестовых данных.

---

## Шаг 9.12 — Финальная проверка

### Задача

Прогнать все проверки, убедиться в стабильности.

### Действия

```bash
npm run build       # Сборка
npm run lint        # ESLint
npm test            # Все тесты (288 существующих + новые)
npm run typesCheck  # TypeScript
```

### Ручная проверка

1. `rag export --all` → создаёт архив
2. `rag export --dry-run` → показывает сводку
3. `rag import <archive> --all` → восстанавливает данные
4. `rag re-embed --source <name>` → генерирует эмбеддинги
5. `rag search` через MCP → поиск работает по импортированным данным

---

## Новые зависимости

| Пакет | Тип | Назначение |
|-------|-----|-----------|
| `@inquirer/prompts` | dependencies | Интерактивный выбор (checkbox, confirm) |
| `tar` | dependencies | Упаковка/распаковка .tar.gz |
| `@types/tar` | devDependencies | Типы для tar |

## Новые файлы (итого)

```
src/export/
├── manifest.ts                  # Шаг 9.2
├── sanitizer.ts                 # Шаг 9.3
├── archive.ts                   # Шаг 9.4
├── exporter.ts                  # Шаг 9.5
├── importer.ts                  # Шаг 9.6
└── __tests__/
    ├── manifest.test.ts         # Шаг 9.2
    ├── sanitizer.test.ts        # Шаг 9.3
    ├── archive.test.ts          # Шаг 9.4
    ├── exporter.test.ts         # Шаг 9.5
    ├── importer.test.ts         # Шаг 9.6
    └── integration.test.ts      # Шаг 9.11

src/commands/
├── export-cmd.ts                # Шаг 9.7
├── import-cmd.ts                # Шаг 9.8
└── re-embed-cmd.ts              # Шаг 9.9
```

## Изменяемые файлы

| Файл | Шаг | Изменения |
|------|-----|-----------|
| `package.json` | 9.1, 9.4 | +@inquirer/prompts, +tar, +@types/tar |
| `src/cli.ts` | 9.10 | +3 addCommand |
| `src/storage/chunks.ts` | 9.9 | +getChunksForReEmbed, +updateEmbedding, +countForReEmbed |

---

## Чеклист завершения фазы 9

- [ ] @inquirer/prompts и tar установлены
- [ ] manifest.ts: Zod-схема, write/read, getSchemaVersion
- [ ] sanitizer.ts: копирует конфиг без подстановки env vars
- [ ] archive.ts: pack/unpack tar.gz
- [ ] exporter.ts: query → SQL INSERT → архив
- [ ] importer.ts: архив → validate → execute SQL
- [ ] export-cmd.ts: интерактивный выбор, --dry-run, прогресс
- [ ] import-cmd.ts: --force, --remap-path, conflict resolution
- [ ] re-embed-cmd.ts: NULL по умолчанию, --force для всех
- [ ] cli.ts: три новые команды зарегистрированы
- [ ] Тесты для всех модулей
- [ ] `npm run build` — OK
- [ ] `npm run lint` — OK
- [ ] `npm test` — все тесты проходят
