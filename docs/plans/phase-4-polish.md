# Фаза 4: Полировка

Цель: фильтрация файлов, полный набор CLI-команд, альтернативный embedding-провайдер.

---

## Шаг 4.1 — FileFilter

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/sources/file-filter.ts` | FileFilter — объединение всех фильтров |
| `src/sources/__tests__/file-filter.test.ts` | Тесты |

### npm-зависимости

Уже установлен: `ignore` — парсинг .gitignore-формата.

### FileFilter

```typescript
// src/sources/file-filter.ts

class FileFilter {
  constructor(options: {
    basePath: string;
    include?: string[];
    exclude?: string[];
  });

  async init(): Promise<void>;
  // Загружает .gitignore и .ragignore из basePath.

  shouldInclude(relativePath: string): boolean;
  // Применяет фильтры в порядке:
  // 1. Встроенные исключения (node_modules, .git, бинарные, >1MB)
  // 2. .gitignore
  // 3. .ragignore
  // 4. Конфиг include/exclude
}
```

### Встроенные исключения

```typescript
const BUILTIN_EXCLUDES = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '*.lock',
  'package-lock.json',
];

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov',
  '.pdf',  // PDF обрабатывается отдельным чанкером.
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
```

### Интеграция

Заменить простую фильтрацию в `scanLocalFiles` на FileFilter.

### Тесты

- node_modules исключаются всегда
- .gitignore паттерны применяются
- .ragignore паттерны применяются
- Конфиг include/exclude работают
- Бинарные файлы исключаются
- Файлы > 1MB исключаются

---

## Шаг 4.2 — CLI list/remove/status

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/commands/list.ts` | `rag list` — список источников |
| `src/commands/remove.ts` | `rag remove <name>` — удаление |
| `src/commands/status-cmd.ts` | `rag status` — статус системы |

### rag list

```
Sources:
  rag-core     local   ~/Work_folder/Kari/rag-core    1,247 chunks   2024-01-15 14:30
  my-docs      local   ~/Documents/tech-docs            342 chunks   2024-01-14 10:15
  upstream-lib git     github.com/org/lib                89 chunks   2024-01-13 09:00

Total: 3 sources, 1,678 chunks
```

### rag remove

```
Removing source "rag-core"...
  Deleted 1,247 chunks
  Removed source record
Done.
```

### rag status

```
Database:
  Connected: yes
  Schema version: 001_initial
  Total chunks: 1,678
  Total sources: 3

Providers:
  Embeddings: jina (configured)
  Reranker: jina (configured)

Indexing:
  Last indexed: 2024-01-15 14:30
```

### Улучшенный progress

Обновить ConsoleProgress для более подробного вывода (как в спецификации раздел 9.2).

---

## Шаг 4.3 — OpenAI Embedder

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/embeddings/openai.ts` | OpenAITextEmbedder |
| `src/embeddings/__tests__/openai.test.ts` | Тесты (мок HTTP) |
| `src/storage/migrations/002_vector_dimensions.ts` | Миграция размерности |

### npm-зависимости

Новых нет. HTTP-запросы через встроенный `fetch`.

### OpenAITextEmbedder

```typescript
class OpenAITextEmbedder implements TextEmbedder {
  // API: https://api.openai.com/v1/embeddings
  // Модель: text-embedding-3-small (1536d)
  // Батчи по 100 текстов.
  // Нет разделения task для query/document (в отличие от Jina).

  embed(input: string): Promise<number[]>;
  embedBatch(inputs: string[]): Promise<number[][]>;
  embedQuery(input: string): Promise<number[]>;
  readonly dimensions: number; // 1536
}
```

### Миграция размерности

```sql
-- 002_vector_dimensions.ts
-- Изменение размерности vector колонки.
-- Требуется удаление HNSW-индекса, ALTER COLUMN, пересоздание индекса.
-- Применяется только при смене провайдера.

ALTER TABLE chunks DROP CONSTRAINT IF EXISTS chunks_embedding_check;
DROP INDEX IF EXISTS idx_chunks_embedding;

ALTER TABLE chunks
  ALTER COLUMN embedding TYPE vector(${dimensions});

CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

### Обновление фабрики

Добавить `case 'openai'` в `createTextEmbedder`.

### Тесты

- embed() возвращает вектор 1536d (мок HTTP)
- embedBatch() разбивает на батчи по 100
- Ошибка при отсутствии API key
