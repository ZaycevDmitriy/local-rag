# Фаза 2: MCP + Rerank

Цель: MCP сервер с 4 инструментами, Jina Reranker, инкрементальная индексация.

---

## Шаг 2.1 — Jina Reranker

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/search/reranker/types.ts` | Reranker interface |
| `src/search/reranker/jina.ts` | Jina Reranker v2 |
| `src/search/reranker/noop.ts` | NoopReranker (passthrough) |
| `src/search/reranker/factory.ts` | createReranker(config) |
| `src/search/reranker/__tests__/jina.test.ts` | Тесты (мок HTTP) |

### Ключевые интерфейсы

```typescript
// src/search/reranker/types.ts

interface RerankDocument {
  id: string;
  content: string;
}

interface RerankResult {
  id: string;
  score: number;
  index: number;
}

interface Reranker {
  rerank(
    query: string,
    documents: RerankDocument[],
    topK: number,
  ): Promise<RerankResult[]>;
}
```

### JinaReranker

- API: `https://api.jina.ai/v1/rerank`
- Модель: `jina-reranker-v2-base-multilingual`
- Принимает query + documents, возвращает переранжированный список
- Retry при 429/5xx

### NoopReranker

- Passthrough: возвращает документы в исходном порядке с score = 1.0
- Используется когда `reranker.provider: 'none'`

### Интеграция в SearchCoordinator

- После RRF fusion: если reranker !== noop, вызвать rerank(query, top-50 candidates, finalTopK)
- Добавить `rerank` score в SearchResult.scores

### npm-зависимости

Новых нет. HTTP-запросы через встроенный `fetch`.

---

## Шаг 2.2 — MCP Server

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/mcp/server.ts` | MCP stdio server |
| `src/mcp/tools/search.ts` | search tool |
| `src/mcp/tools/read-source.ts` | read_source tool |
| `src/mcp/tools/list-sources.ts` | list_sources tool |
| `src/mcp/tools/status.ts` | status tool |
| `src/mcp-entry.ts` | Entry point (обновление заглушки) |

### npm-зависимости

- `@modelcontextprotocol/sdk` — MCP SDK

### MCP Server

```typescript
// src/mcp/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function createMcpServer(config: AppConfig): Promise<Server>;
// Создает MCP server, регистрирует 4 инструмента, подключает stdio transport.
```

### search tool

```typescript
// Input schema (Zod)
{
  query: z.string().min(1).max(2048),
  topK: z.number().min(1).max(100).default(10),
  sourceId: z.string().uuid().optional(),
  sourceType: z.enum(['code', 'markdown', 'text', 'pdf']).optional(),
  pathPrefix: z.string().optional(),
}

// Вызывает SearchCoordinator.search()
```

### read_source tool

```typescript
// Input schema
{
  chunkId: z.string().uuid().optional(),
  sourceName: z.string().optional(),
  path: z.string().optional(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  context: z.number().default(0),
}

// По chunkId: загружает чанк из БД, читает исходный файл.
// По координатам: находит source, читает файл, возвращает фрагмент.
```

### list_sources tool

```typescript
// Input schema
{
  limit: z.number().default(50),
}

// Вызывает SourceStorage.getAll(), форматирует ответ.
```

### status tool

```typescript
// Input: пустой объект.

// Возвращает: состояние БД, провайдеры, статус индексации.
```

### Верификация

```bash
npx @modelcontextprotocol/inspector node dist/mcp-entry.js
# Проверить все 4 инструмента через Inspector.
```

---

## Шаг 2.3 — Инкрементальная индексация

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/storage/indexed-files.ts` | IndexedFileStorage CRUD |
| `src/indexer/incremental.ts` | detectChanges — определение изменений |

### IndexedFileStorage

```typescript
class IndexedFileStorage {
  constructor(sql: postgres.Sql);

  async getBySource(sourceId: string): Promise<IndexedFileRow[]>;
  async upsert(sourceId: string, path: string, fileHash: string): Promise<void>;
  async deleteBySource(sourceId: string): Promise<void>;
  async deleteByPath(sourceId: string, path: string): Promise<void>;
}
```

### detectChanges

```typescript
interface FileChange {
  path: string;
  absolutePath: string;
  content: string;
  status: 'added' | 'modified' | 'deleted';
}

interface ChangeDetectionResult {
  changed: FileChange[];
  unchanged: number;
  deleted: string[];
}

async function detectChanges(
  sourceId: string,
  files: ScannedFile[],
  indexedFileStorage: IndexedFileStorage,
): Promise<ChangeDetectionResult>;
// 1. Для каждого файла — SHA-256 hash.
// 2. Сравнить с indexed_files.
// 3. Найти удаленные файлы (есть в БД, нет на диске).
```

### Модификация Indexer

- Перед chunking: вызвать detectChanges
- Обрабатывать только changed файлы
- Удалять чанки для deleted файлов
- Обновлять indexed_files после индексации

### Тесты

- Новые файлы: все помечены как `added`
- Неизмененные файлы: пропускаются
- Измененные файлы: помечены как `modified`
- Удаленные файлы: помечены как `deleted`
