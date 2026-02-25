# Фаза 1: Ядро

Цель: от нуля до работающего hybrid search с CLI.

---

## Шаг 1.1 — Инициализация проекта

### Файлы

| Файл | Назначение |
|------|-----------|
| `package.json` | type: module, bin: rag, scripts |
| `tsconfig.json` | ES2022, Node16, strict |
| `vitest.config.ts` | Конфигурация Vitest |
| `.eslintrc.cjs` | ESLint + @typescript-eslint |
| `.gitignore` | node_modules, dist, .env, etc. |
| `docker-compose.yml` | PostgreSQL 16 + pgvector |
| `src/cli.ts` | Заглушка CLI entry point |
| `src/mcp-entry.ts` | Заглушка MCP entry point |

### package.json (ключевые поля)

```json
{
  "name": "local-rag",
  "type": "module",
  "bin": { "rag": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "lint": "eslint src/",
    "test": "vitest run",
    "typesCheck": "tsc --noEmit"
  }
}
```

### tsconfig.json (ключевые поля)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### docker-compose.yml

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: local_rag
      POSTGRES_USER: rag
      POSTGRES_PASSWORD: rag
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### npm-зависимости

**Production:**
- `postgres` — PostgreSQL клиент
- `pgvector` — работа с vector типом
- `zod` — валидация
- `yaml` — парсинг YAML
- `commander` — CLI
- `fast-glob` — поиск файлов
- `ignore` — .gitignore парсинг

**Dev:**
- `typescript`
- `vitest`
- `eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`
- `tsx` — запуск TS без сборки
- `@types/node`

### Верификация

```bash
npm run build     # Компиляция без ошибок
npm run lint      # Линтинг проходит
npm test          # Vitest запускается (0 тестов)
npm run typesCheck # Типы корректны
```

---

## Шаг 1.2 — Config (YAML + Zod)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/config/schema.ts` | Zod-схемы конфигурации |
| `src/config/defaults.ts` | Значения по умолчанию |
| `src/config/loader.ts` | Загрузка YAML, подстановка `${ENV_VAR}`, поиск файла |
| `src/config/__tests__/loader.test.ts` | Тесты загрузки конфига |

### Ключевые интерфейсы

```typescript
// src/config/schema.ts

const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  name: z.string(),
  user: z.string(),
  password: z.string(),
});

const JinaEmbeddingsSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  dimensions: z.number(),
});

const OpenAIEmbeddingsSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  dimensions: z.number(),
});

const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['jina', 'openai', 'self-hosted']),
  jina: JinaEmbeddingsSchema.optional(),
  openai: OpenAIEmbeddingsSchema.optional(),
});

const JinaRerankerSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  topK: z.number(),
});

const RerankerConfigSchema = z.object({
  provider: z.enum(['jina', 'none']),
  jina: JinaRerankerSchema.optional(),
});

const RrfConfigSchema = z.object({
  k: z.number(),
});

const SearchConfigSchema = z.object({
  bm25Weight: z.number(),
  vectorWeight: z.number(),
  retrieveTopK: z.number(),
  finalTopK: z.number(),
  rrf: RrfConfigSchema,
});

const SourceConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'git']),
  path: z.string().optional(),
  url: z.string().optional(),
  branch: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

const IndexingConfigSchema = z.object({
  git: z.object({
    cloneDir: z.string(),
  }),
  chunkSize: z.object({
    maxTokens: z.number(),
    overlap: z.number(),
  }),
});

const AppConfigSchema = z.object({
  database: DatabaseConfigSchema,
  embeddings: EmbeddingsConfigSchema,
  reranker: RerankerConfigSchema,
  search: SearchConfigSchema,
  sources: z.array(SourceConfigSchema),
  indexing: IndexingConfigSchema,
});

type AppConfig = z.infer<typeof AppConfigSchema>;
```

```typescript
// src/config/loader.ts

// Порядок поиска конфига:
// 1. ./rag.config.yaml
// 2. ~/.config/rag/config.yaml

function resolveEnvVars(value: string): string;
// Заменяет ${ENV_VAR} на process.env.ENV_VAR.

async function loadConfig(configPath?: string): Promise<AppConfig>;
// Загружает YAML, подставляет переменные, валидирует через Zod.
```

### Тесты

- Загрузка валидного YAML -> AppConfig
- Подстановка `${ENV_VAR}` из process.env
- Ошибка при невалидном конфиге (отсутствующие обязательные поля)
- Применение дефолтных значений
- Поиск конфиг-файла по путям

---

## Шаг 1.3 — PostgreSQL schema + миграции

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/storage/db.ts` | Создание подключения через `postgres` |
| `src/storage/schema.ts` | TypeScript-типы строк (SourceRow, ChunkRow, IndexedFileRow) |
| `src/storage/migrator.ts` | Движок миграций (таблица `_migrations`) |
| `src/storage/migrations/001_initial.ts` | Начальная миграция |

### src/storage/db.ts

```typescript
import postgres from 'postgres';
import { DatabaseConfig } from '../config/schema.js';

function createDb(config: DatabaseConfig): postgres.Sql;
// Создает подключение к PostgreSQL.

async function closeDb(sql: postgres.Sql): Promise<void>;
// Закрывает подключение.
```

### src/storage/schema.ts

```typescript
interface SourceRow {
  id: string;
  name: string;
  type: 'local' | 'git';
  path: string | null;
  git_url: string | null;
  git_branch: string | null;
  config: Record<string, unknown>;
  last_indexed_at: Date | null;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ChunkRow {
  id: string;
  source_id: string;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  created_at: Date;
}

interface IndexedFileRow {
  id: string;
  source_id: string;
  path: string;
  file_hash: string;
  indexed_at: Date;
}
```

### src/storage/migrator.ts

```typescript
interface Migration {
  name: string;
  up(sql: postgres.Sql): Promise<void>;
}

async function runMigrations(sql: postgres.Sql, migrations: Migration[]): Promise<void>;
// Создает таблицу _migrations (если нет), применяет непримененные миграции.

async function getAppliedMigrations(sql: postgres.Sql): Promise<string[]>;
// Возвращает список примененных миграций.
```

### SQL (001_initial.ts)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  path        TEXT,
  git_url     TEXT,
  git_branch  TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  last_indexed_at TIMESTAMPTZ,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  metadata      JSONB NOT NULL,
  embedding     vector(1024),
  search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_source    ON chunks(source_id);
CREATE INDEX idx_chunks_hash      ON chunks(source_id, content_hash);
CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
CREATE INDEX idx_chunks_fts       ON chunks USING GIN (search_vector);

CREATE TABLE indexed_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, path)
);
```

### Верификация

```bash
docker compose up -d
npm run dev -- init   # Миграции применяются без ошибок
```

---

## Шаг 1.4 — Chunking (MarkdownChunker + FixedSizeChunker)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/chunks/types.ts` | Chunk, ChunkMetadata, Chunker, FileContent |
| `src/chunks/markdown/markdown-chunker.ts` | Разбиение по заголовкам |
| `src/chunks/text/fixed-chunker.ts` | Скользящее окно с overlap |
| `src/chunks/dispatcher.ts` | ChunkDispatcher |
| `src/chunks/__tests__/markdown-chunker.test.ts` | Тесты markdown |
| `src/chunks/__tests__/fixed-chunker.test.ts` | Тесты fixed-size |
| `src/chunks/__tests__/dispatcher.test.ts` | Тесты диспетчера |

### Ключевые интерфейсы

```typescript
// src/chunks/types.ts

interface FileContent {
  path: string;       // Относительный путь файла.
  content: string;    // Текстовое содержимое.
  sourceId: string;   // ID источника.
}

interface ChunkMetadata {
  path: string;
  sourceType: 'code' | 'markdown' | 'text' | 'pdf';
  startLine?: number;
  endLine?: number;
  fqn?: string;
  fragmentType?: string;
  language?: string;
  headerPath?: string;
  headerLevel?: number;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
}

interface Chunk {
  id: string;          // crypto.randomUUID()
  sourceId: string;
  content: string;
  contentHash: string; // SHA-256
  metadata: ChunkMetadata;
}

interface Chunker {
  chunk(file: FileContent): Chunk[];
  supports(filePath: string): boolean;
}
```

### MarkdownChunker

- Разбивает по заголовкам (`#`, `##`, `###` и т.д.)
- Формирует `headerPath`: `"# API > ## Auth > ### JWT"`
- Если секция > maxTokens — разрезает с overlap
- `supports`: `.md`, `.mdx`

### FixedSizeChunker

- Скользящее окно по символам/строкам
- Параметры: `maxTokens`, `overlap`
- `startOffset` / `endOffset` в метаданных
- `supports`: `.txt`, `.csv`, `.log` и все остальные неизвестные расширения

### ChunkDispatcher

```typescript
class ChunkDispatcher {
  constructor(chunkers: Chunker[], fallback: Chunker);
  chunk(file: FileContent): Chunk[];
  // Находит первый chunker, который supports(file.path),
  // если не найден — использует fallback (FixedSizeChunker).
}
```

### Тесты

- MarkdownChunker: заголовки разных уровней, headerPath, вложенные секции
- FixedSizeChunker: overlap, длинные файлы, короткие файлы (1 чанк)
- ChunkDispatcher: выбор правильного чанкера по расширению

---

## Шаг 1.5 — Embeddings (JinaTextEmbedder)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/embeddings/types.ts` | TextEmbedder interface |
| `src/embeddings/jina.ts` | Jina Embeddings v3 |
| `src/embeddings/factory.ts` | createTextEmbedder(config) |
| `src/embeddings/__tests__/jina.test.ts` | Тесты (мок HTTP) |

### Ключевые интерфейсы

```typescript
// src/embeddings/types.ts

interface TextEmbedder {
  // Генерация эмбеддинга для одного текста.
  embed(input: string): Promise<number[]>;

  // Батч-генерация эмбеддингов.
  embedBatch(inputs: string[]): Promise<number[][]>;

  // Генерация эмбеддинга запроса (может отличаться task prefix).
  embedQuery(input: string): Promise<number[]>;

  // Размерность вектора.
  readonly dimensions: number;
}
```

### JinaTextEmbedder

- API endpoint: `https://api.jina.ai/v1/embeddings`
- Батчи по 64 текста
- `task: 'retrieval.passage'` для документов, `task: 'retrieval.query'` для запросов
- Модель: `jina-embeddings-v3` (1024d)
- Retry при 429/5xx

### Фабрика

```typescript
function createTextEmbedder(config: EmbeddingsConfig): TextEmbedder;
// По config.provider создает JinaTextEmbedder или OpenAITextEmbedder.
```

### Тесты

- embed() возвращает вектор нужной размерности (мок HTTP)
- embedBatch() разбивает на батчи по 64
- embedQuery() использует task: retrieval.query
- Ошибка при отсутствии API key

---

## Шаг 1.6 — Storage CRUD

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/storage/sources.ts` | SourceStorage — CRUD для sources |
| `src/storage/chunks.ts` | ChunkStorage — CRUD для chunks + поиск |

### SourceStorage

```typescript
class SourceStorage {
  constructor(sql: postgres.Sql);

  async upsert(data: {
    name: string;
    type: 'local' | 'git';
    path?: string;
    gitUrl?: string;
    gitBranch?: string;
    config?: Record<string, unknown>;
  }): Promise<SourceRow>;

  async getByName(name: string): Promise<SourceRow | null>;
  async getAll(): Promise<SourceRow[]>;
  async remove(name: string): Promise<void>;

  async updateAfterIndex(
    sourceId: string,
    chunkCount: number,
  ): Promise<void>;
  // Обновляет last_indexed_at и chunk_count.
}
```

### ChunkStorage

```typescript
class ChunkStorage {
  constructor(sql: postgres.Sql);

  async insertBatch(chunks: Array<{
    sourceId: string;
    content: string;
    contentHash: string;
    metadata: ChunkMetadata;
    embedding: number[];
  }>): Promise<void>;

  async deleteBySource(sourceId: string): Promise<number>;
  async deleteByPath(sourceId: string, path: string): Promise<number>;

  async searchBm25(
    query: string,
    limit: number,
    sourceId?: string,
  ): Promise<Array<{ id: string; score: number }>>;

  async searchVector(
    embedding: number[],
    limit: number,
    sourceId?: string,
  ): Promise<Array<{ id: string; score: number }>>;

  async getByIds(ids: string[]): Promise<ChunkRow[]>;
}
```

### Верификация

- Интеграционные тесты с реальным PostgreSQL (опциональные, через переменную окружения)

---

## Шаг 1.7 — Hybrid Search (BM25 + Vector + RRF)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/search/types.ts` | SearchQuery, SearchResult, SearchResponse, ScoredChunk |
| `src/search/hybrid.ts` | rrfFuse() — RRF fusion |
| `src/search/coordinator.ts` | SearchCoordinator — оркестрация поиска |
| `src/search/__tests__/hybrid.test.ts` | Тесты RRF fusion |

### Ключевые интерфейсы

```typescript
// src/search/types.ts

interface SearchQuery {
  query: string;
  topK?: number;
  sourceId?: string;
  sourceType?: string;
  pathPrefix?: string;
}

interface ScoredChunk {
  id: string;
  score: number;
}

interface SearchResult {
  chunkId: string;
  path: string;
  sourceType: string;
  sourceName: string;
  snippet: string;
  coordinates: {
    startLine?: number;
    endLine?: number;
    fqn?: string;
    fragmentType?: string;
    headerPath?: string;
    pageStart?: number;
    pageEnd?: number;
  };
  scores: {
    bm25: number | null;
    vector: number | null;
    rrf: number;
    rerank: number | null;
  };
}

interface SearchResponse {
  results: SearchResult[];
  totalCandidates: number;
}
```

### RRF Fusion

```typescript
// src/search/hybrid.ts

function rrfFuse(
  bm25Results: ScoredChunk[],
  vectorResults: ScoredChunk[],
  k?: number,        // default 60
  bm25Weight?: number, // default 0.4
  vectorWeight?: number, // default 0.6
): ScoredChunk[];
// rrf_score(d) = bm25Weight/(k + rank_bm25) + vectorWeight/(k + rank_vector)
// Сортировка по rrf_score DESC.
```

### SearchCoordinator

```typescript
class SearchCoordinator {
  constructor(
    chunkStorage: ChunkStorage,
    sourceStorage: SourceStorage,
    embedder: TextEmbedder,
    searchConfig: SearchConfig,
  );

  async search(query: SearchQuery): Promise<SearchResponse>;
  // 1. embed query (embedQuery)
  // 2. parallel: searchBm25 + searchVector
  // 3. rrfFuse
  // 4. getByIds для top-K
  // 5. формирование SearchResponse
}
```

### Тесты

- rrfFuse: пересечение результатов, непересекающиеся, веса, пустые списки
- rrfFuse: сортировка по убыванию rrf_score

---

## Шаг 1.8 — CLI (rag init, rag index)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/cli.ts` | Commander setup, точка входа |
| `src/commands/init.ts` | `rag init` — запуск миграций |
| `src/commands/index-cmd.ts` | `rag index [name] --path --all` |
| `src/sources/local.ts` | LocalSource.scanFiles |
| `src/indexer/indexer.ts` | Indexer pipeline |
| `src/indexer/progress.ts` | ConsoleProgress |

### CLI

```typescript
// src/cli.ts
import { Command } from 'commander';

const program = new Command()
  .name('rag')
  .description('Local RAG — semantic search for code and docs')
  .version('0.1.0');

// Подключение команд.
program.addCommand(initCommand);
program.addCommand(indexCommand);

program.parse();
```

### LocalSource

```typescript
// src/sources/local.ts

interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

async function scanLocalFiles(
  basePath: string,
  options?: { include?: string[]; exclude?: string[] },
): Promise<ScannedFile[]>;
// Сканирует папку через fast-glob.
// Встроенные исключения: node_modules, .git, бинарные, >1MB.
```

### Indexer

```typescript
// src/indexer/indexer.ts

class Indexer {
  constructor(
    chunkStorage: ChunkStorage,
    sourceStorage: SourceStorage,
    embedder: TextEmbedder,
    dispatcher: ChunkDispatcher,
    progress: ProgressReporter,
  );

  async indexSource(source: SourceRow, files: ScannedFile[]): Promise<IndexResult>;
  // Pipeline: files -> chunk -> embed batch -> store.
}

interface IndexResult {
  totalFiles: number;
  totalChunks: number;
  newChunks: number;
  duration: number;
}
```

### ConsoleProgress

```typescript
// src/indexer/progress.ts

interface ProgressReporter {
  onScanComplete(fileCount: number, excludedCount: number): void;
  onChunkComplete(chunkCount: number, fileCount: number): void;
  onEmbedProgress(current: number, total: number): void;
  onStoreComplete(): void;
  onComplete(result: IndexResult): void;
}

class ConsoleProgress implements ProgressReporter { ... }
```

### Верификация

```bash
docker compose up -d
npm run build
npx rag init                            # Миграции
npx rag index --path ./test-folder --name test  # Индексация
```
