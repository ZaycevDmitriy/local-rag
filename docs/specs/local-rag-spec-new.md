# Local RAG — спецификация проекта

## 1. Обзор

**Local RAG** — персональная система семантического поиска по коду и документации. Индексирует локальные папки и Git-репозитории, предоставляет hybrid search (BM25 + vector + rerank) через MCP-интерфейс для AI-агентов (Claude Code, Cursor).

**Ключевые принципы:**
- Один процесс, минимум внешних зависимостей
- Hybrid search с reranking для максимального качества
- Инкрементальная индексация (обновляются только изменённые файлы)
- Расширяемая архитектура (граф кода, новые языки, новые провайдеры)

---

## 2. Технический стек

| Компонент | Технология | Обоснование |
|---|---|---|
| **Язык** | TypeScript (ESM) | Экосистема MCP SDK, tree-sitter, знакомый стек |
| **БД** | PostgreSQL (Docker) | pgvector для векторов + tsvector для BM25 + метаданные — всё в одной БД |
| **Эмбеддинги** | Jina Embeddings v3 (default) | 1024d, мультиязычный, хорошо работает с кодом. Абстракция TextEmbedder позволяет переключить на OpenAI/self-hosted |
| **Reranker** | Jina Reranker v2 API | Доступный ($0.018/1K запросов), хорошее качество для кода |
| **Парсинг кода** | tree-sitter | Полноценный AST для TS/JS, fallback (простые правила) для остальных языков |
| **MCP** | @modelcontextprotocol/sdk | stdio transport, запускается Claude Code/Cursor по требованию |
| **Конфиг** | YAML (rag.config.yaml) | Читаемый, поддерживает комментарии |

---

## 3. Архитектура

### 3.1. Модульная структура

```
src/
├── sources/           # Получение данных из источников
│   ├── local.ts       # Чтение локальных папок
│   ├── git.ts         # Клонирование Git-репозиториев
│   └── file-filter.ts # .gitignore + .ragignore + конфиг-фильтры
│
├── chunks/            # Разбиение на фрагменты (chunking)
│   ├── types.ts       # Chunk, ChunkMetadata, координаты
│   ├── code/          # AST-парсинг через tree-sitter
│   │   ├── tree-sitter-chunker.ts
│   │   ├── queries/   # tree-sitter queries по языкам
│   │   │   ├── typescript.ts   # Полноценные queries
│   │   │   └── ...             # Другие языки (по мере необходимости)
│   │   └── fallback-chunker.ts # Простые правила для языков без queries
│   ├── markdown/      # Chunking по заголовкам
│   │   └── markdown-chunker.ts
│   └── text/          # Фиксированные чанки для txt/pdf
│       └── fixed-chunker.ts
│
├── embeddings/        # Генерация векторных представлений
│   ├── types.ts       # TextEmbedder interface
│   ├── jina.ts        # Jina Embeddings v3 (default)
│   ├── openai.ts      # OpenAI text-embedding-3-small
│   └── factory.ts     # Создание embedder по конфигу
│
├── search/            # Поиск и ранжирование
│   ├── types.ts       # SearchQuery, SearchResult
│   ├── hybrid.ts      # BM25 + vector + RRF fusion
│   ├── reranker/      # Переранжирование результатов
│   │   ├── types.ts   # Reranker interface
│   │   ├── jina.ts    # Jina Reranker v2
│   │   └── noop.ts    # Passthrough (без rerank)
│   └── coordinator.ts # Оркестрация: retrieve → fuse → rerank → topK
│
├── storage/           # PostgreSQL: схема, миграции, запросы
│   ├── schema.ts      # Определение таблиц
│   ├── migrations/    # SQL-миграции
│   ├── chunks.ts      # CRUD для чанков + pgvector + tsvector
│   └── sources.ts     # CRUD для источников
│
├── mcp/               # MCP-сервер и инструменты
│   ├── server.ts      # stdio MCP server
│   ├── tools/
│   │   ├── search.ts
│   │   ├── read-source.ts
│   │   ├── list-sources.ts
│   │   └── status.ts
│   └── types.ts       # ToolDef interface
│
├── indexer/           # Оркестрация индексации
│   ├── indexer.ts     # Главный pipeline: source → chunk → embed → store
│   ├── incremental.ts # Сравнение hash-ей, определение изменений
│   └── progress.ts    # Отчёт о прогрессе индексации
│
├── config/            # Конфигурация
│   ├── schema.ts      # Zod-схема конфига
│   ├── loader.ts      # Загрузка YAML + валидация
│   └── defaults.ts    # Значения по умолчанию
│
├── cli.ts             # CLI entry point (rag index, rag status)
└── mcp-entry.ts       # MCP entry point (stdio server)
```

### 3.2. Runtime-модель

```
┌──────────────────────────────────────────────────────┐
│ CLI (rag index /path)                                 │
│   → Indexer → Chunker → Embedder → PostgreSQL        │
│   Запускается вручную, завершается после индексации  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ MCP Server (stdio, запускается Claude Code/Cursor)    │
│   → search / read_source / list_sources / status     │
│   → PostgreSQL (pgvector + tsvector)                 │
│   → Jina API (embeddings для query + rerank)         │
│   Живёт пока жива MCP-сессия                        │
└──────────────────────────────────────────────────────┘

Оба работают с одной PostgreSQL (Docker).
```

---

## 4. Источники данных

### 4.1. Типы источников

| Тип | Описание | Триггер |
|---|---|---|
| **local** | Папка на диске (`~/Work_folder/MyProject`) | `rag index /path` |
| **git** | Git remote URL | `rag index --git https://github.com/...` |

Git-источники клонируются в локальную директорию (настраивается в конфиге), далее обрабатываются как локальные папки.

### 4.2. Фильтрация файлов

Порядок применения фильтров:

1. **Встроенные исключения** (всегда): `node_modules/`, `.git/`, бинарные файлы, файлы >1MB
2. **.gitignore** (если есть): стандартный gitignore-парсинг
3. **.ragignore** (если есть): дополнительные исключения в формате gitignore
4. **Конфиг** (если указано): `include`/`exclude` паттерны для конкретного источника

### 4.3. Конфигурация (rag.config.yaml)

```yaml
# ~/.config/rag/config.yaml или ./rag.config.yaml

# Подключение к PostgreSQL.
database:
  host: localhost
  port: 5432
  name: local_rag
  user: rag
  password: rag

# Провайдер эмбеддингов.
embeddings:
  provider: jina           # jina | openai | self-hosted
  jina:
    apiKey: ${JINA_API_KEY}
    model: jina-embeddings-v3
    dimensions: 1024
  openai:
    apiKey: ${OPENAI_API_KEY}
    model: text-embedding-3-small
    dimensions: 1536

# Провайдер reranking.
reranker:
  provider: jina           # jina | none
  jina:
    apiKey: ${JINA_API_KEY}
    model: jina-reranker-v2-base-multilingual
    topK: 10               # Сколько документов после rerank

# Параметры поиска.
search:
  bm25Weight: 0.4          # Вес BM25 в RRF
  vectorWeight: 0.6        # Вес векторного поиска в RRF
  retrieveTopK: 50         # Сколько кандидатов до rerank
  finalTopK: 10            # Сколько результатов после rerank
  rrf:
    k: 60                  # Параметр RRF (Reciprocal Rank Fusion)

# Источники данных.
sources:
  - name: rag-core
    type: local
    path: ~/Work_folder/Kari/rag-core
    exclude:
      - "dist/**"
      - "coverage/**"

  - name: my-docs
    type: local
    path: ~/Documents/tech-docs
    include:
      - "**/*.md"
      - "**/*.txt"

  - name: upstream-lib
    type: git
    url: https://github.com/org/lib.git
    branch: main

# Индексация.
indexing:
  git:
    cloneDir: ~/.local/share/rag/repos
  chunkSize:
    maxTokens: 1000        # Максимум токенов для fixed-size чанков
    overlap: 100            # Overlap для fixed-size чанков
```

---

## 5. Chunking (разбиение на фрагменты)

### 5.1. Стратегия по типу файла

| Тип файла | Стратегия | Координаты чанка |
|---|---|---|
| **TS/JS** (.ts, .tsx, .js, .jsx) | tree-sitter AST (полноценные queries) | `{path, startLine, endLine, fqn, type}` |
| **Другие языки** (.py, .go, .rs...) | tree-sitter fallback (функции/классы по indent) | `{path, startLine, endLine}` |
| **Markdown** (.md, .mdx) | По заголовкам (##) с иерархией | `{path, headerPath}` (например `"# API > ## Auth > ### JWT"`) |
| **Текст** (.txt, .csv, .log) | Fixed-size чанки с overlap | `{path, startOffset, endOffset}` |
| **PDF** (.pdf) | По страницам / fixed-size | `{path, pageStart, pageEnd}` |

### 5.2. Модель чанка

```typescript
interface Chunk {
  id: string;                    // UUID
  sourceId: string;              // ID источника
  content: string;               // Текст чанка
  contentHash: string;           // SHA-256 для инкрементальной индексации
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  path: string;                  // Относительный путь файла
  sourceType: 'code' | 'markdown' | 'text' | 'pdf';

  // Координаты — зависят от sourceType.
  startLine?: number;            // code
  endLine?: number;              // code
  fqn?: string;                  // code (tree-sitter): "MyClass.myMethod"
  fragmentType?: string;         // code: CLASS | METHOD | FUNCTION | FIELD | ...
  language?: string;             // code: typescript, python, ...

  headerPath?: string;           // markdown: "# API > ## Auth"
  headerLevel?: number;          // markdown: 1, 2, 3...

  startOffset?: number;          // text
  endOffset?: number;            // text

  pageStart?: number;            // pdf
  pageEnd?: number;              // pdf
}
```

### 5.3. Tree-sitter queries для TS/JS

Полноценные queries извлекают:
- Классы и интерфейсы (с телом)
- Методы и функции (с телом)
- Экспортируемые константы и type aliases
- Enum-ы

Для каждого фрагмента формируется FQN (Fully Qualified Name): `ClassName.methodName`, `moduleName.functionName`.

### 5.4. Fallback chunker (другие языки)

Простые правила:
- Разбиение по пустым строкам + отступам (блоки кода)
- Если блок >maxTokens — разрезание с overlap
- Без FQN, без типизации фрагментов

---

## 6. Хранение (PostgreSQL)

### 6.1. Расширения

```sql
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector для векторного поиска
```

### 6.2. Схема

```sql
-- Источники данных.
CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,             -- 'local' | 'git'
  path        TEXT,                      -- Локальный путь
  git_url     TEXT,                      -- Git remote URL
  git_branch  TEXT,                      -- Ветка для git-источника
  config      JSONB NOT NULL DEFAULT '{}',
  last_indexed_at TIMESTAMPTZ,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Чанки (фрагменты).
CREATE TABLE chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,            -- SHA-256 для инкрементальности
  metadata      JSONB NOT NULL,           -- ChunkMetadata (path, coordinates, etc.)

  -- Векторный поиск (pgvector).
  embedding     vector(1024),             -- Размерность зависит от провайдера

  -- Полнотекстовый поиск (BM25).
  search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple', content)
    ) STORED,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы.
CREATE INDEX idx_chunks_source     ON chunks(source_id);
CREATE INDEX idx_chunks_hash       ON chunks(source_id, content_hash);
CREATE INDEX idx_chunks_path       ON chunks USING GIN ((metadata->>'path') gin_trgm_ops);
CREATE INDEX idx_chunks_embedding  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
CREATE INDEX idx_chunks_fts        ON chunks USING GIN (search_vector);

-- Метаданные индексации (для инкрементальности).
CREATE TABLE indexed_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  file_hash   TEXT NOT NULL,              -- SHA-256 содержимого файла
  indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, path)
);
```

### 6.3. Инкрементальная индексация

```
Для каждого файла в источнике:
  1. Вычислить file_hash (SHA-256)
  2. Проверить indexed_files: существует ли (source_id, path, file_hash)?
     ├── Да → файл не изменился → SKIP
     └── Нет → файл новый или изменённый:
         a. Удалить старые чанки этого файла
         b. Разбить файл на чанки
         c. Для каждого чанка: проверить content_hash в БД
            ├── Найден → переиспользовать embedding
            └── Не найден → сгенерировать embedding
         d. Вставить чанки + обновить indexed_files
```

### 6.4. Размерность вектора

Размерность `embedding` колонки зависит от провайдера:
- Jina v3: 1024
- OpenAI text-embedding-3-small: 1536

При смене провайдера необходима переиндексация. Размерность задаётся в миграции при инициализации БД.

---

## 7. Поиск (Hybrid BM25 + Vector + Rerank)

### 7.1. Pipeline поиска

```
User Query (через MCP tool "search")
  │
  ▼
┌─────────────────────────────────────┐
│ 1. Генерация эмбеддинга запроса     │
│    TextEmbedder.embed(query)        │
│    → vector[1024]                   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌────────────────┐  ┌──────────────────┐
│ 2a. BM25       │  │ 2b. Vector       │
│  (tsvector)    │  │  (pgvector)      │
│                │  │                  │
│ plainto_tsquery│  │ cosine distance  │
│ → rank_bm25   │  │ → score          │
│ → top 50      │  │ → top 50         │
└───────┬────────┘  └────────┬─────────┘
        │                    │
        └────────┬───────────┘
                 ▼
┌─────────────────────────────────────┐
│ 3. RRF Fusion                       │
│    rrf_score(d) = Σ 1/(k + rank_i)  │
│    k = 60 (configurable)            │
│    Объединение и переранжирование   │
│    → top 50 кандидатов              │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ 4. Jina Rerank                      │
│    query + top-50 documents         │
│    → переранжирование по relevance  │
│    → top 10 финальных результатов   │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│ 5. Response                         │
│    path, sourceType, coordinates,   │
│    snippet, scores                  │
└─────────────────────────────────────┘
```

### 7.2. SQL-запросы

**BM25 поиск:**
```sql
SELECT id, ts_rank_cd(search_vector, query) AS bm25_score
FROM chunks, plainto_tsquery('simple', $1) query
WHERE search_vector @@ query
  AND ($2::uuid IS NULL OR source_id = $2)
ORDER BY bm25_score DESC
LIMIT $3;
```

**Векторный поиск:**
```sql
SELECT id, 1 - (embedding <=> $1::vector) AS vector_score
FROM chunks
WHERE ($2::uuid IS NULL OR source_id = $2)
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

**RRF Fusion** выполняется на уровне приложения (TypeScript):
```typescript
function rrfFuse(
  bm25Results: ScoredChunk[],
  vectorResults: ScoredChunk[],
  k: number = 60,
  bm25Weight: number = 0.4,
  vectorWeight: number = 0.6,
): ScoredChunk[] {
  // Для каждого документа: rrf_score = w1/(k + rank_bm25) + w2/(k + rank_vector).
  // Сортировка по rrf_score DESC.
}
```

### 7.3. Фильтрация

Все поисковые запросы поддерживают опциональные фильтры:
- `sourceId` — ограничить поиск одним источником
- `sourceType` — code | markdown | text | pdf
- `pathPrefix` — фильтрация по пути (например `src/services/`)

---

## 8. MCP-инструменты

### 8.1. search

Hybrid поиск с reranking.

**Input:**
```typescript
{
  query: string;              // Поисковый запрос (1-2048 символов)
  topK?: number;              // Количество результатов (1-100, default 10)
  sourceId?: string;          // Фильтр по источнику
  sourceType?: 'code' | 'markdown' | 'text' | 'pdf';
  pathPrefix?: string;        // Фильтр по пути
}
```

**Output:**
```typescript
{
  results: Array<{
    chunkId: string;
    path: string;
    sourceType: string;
    sourceName: string;
    snippet: string;           // Текст чанка (обрезанный до 500 символов)
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
  }>;
  totalCandidates: number;     // Сколько кандидатов до rerank
}
```

### 8.2. read_source

Чтение первоисточника по координатам.

**Input:**
```typescript
{
  chunkId: string;             // ID чанка (из результата search)
  // ИЛИ прямые координаты:
  sourceName?: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  headerPath?: string;
  context?: number;            // Строки контекста вокруг (default 0)
}
```

**Output:**
```typescript
{
  content: string;             // Полный текст
  path: string;
  sourceType: string;
  metadata: ChunkMetadata;
}
```

### 8.3. list_sources

Список проиндексированных источников.

**Input:**
```typescript
{
  pathPrefix?: string;
  sourceType?: string;
  limit?: number;              // Default 50
}
```

**Output:**
```typescript
{
  sources: Array<{
    id: string;
    name: string;
    type: string;
    path: string;
    chunkCount: number;
    lastIndexedAt: string | null;
  }>;
}
```

### 8.4. status

Здоровье системы.

**Input:** нет параметров.

**Output:**
```typescript
{
  database: {
    connected: boolean;
    schemaVersion: string;
    totalChunks: number;
    totalSources: number;
  };
  providers: {
    embeddings: {
      provider: string;        // "jina" | "openai" | ...
      configured: boolean;
    };
    reranker: {
      provider: string;        // "jina" | "none"
      configured: boolean;
    };
  };
  indexing: {
    active: boolean;           // Идёт ли индексация сейчас
    lastIndexedAt: string | null;
  };
}
```

---

## 9. CLI

### 9.1. Команды

```bash
# Индексация конкретного источника (по имени из конфига).
rag index rag-core

# Индексация всех источников.
rag index --all

# Индексация произвольной папки (ad-hoc, без конфига).
rag index --path ~/Work_folder/MyProject --name my-project

# Индексация Git-репозитория.
rag index --git https://github.com/org/repo.git --branch main --name upstream

# Статус системы.
rag status

# Список источников.
rag list

# Удаление источника и его чанков.
rag remove <source-name>

# Инициализация БД (миграции).
rag init
```

### 9.2. Прогресс индексации

CLI отображает прогресс:
```
Indexing rag-core...
  Scanning files: 342 files found (18 excluded by filters)
  Changed: 12 files (330 unchanged, skipped)
  Chunking: 47 chunks from 12 files
  Embedding: 47/47 [████████████████████] 100%
  Storing: done
  Total: 1,247 chunks (+47 new, -3 removed)
  Time: 4.2s
```

---

## 10. Провайдеры (абстракции)

### 10.1. TextEmbedder interface

```typescript
interface TextEmbedder {
  embed(input: string): Promise<number[]>;
  embed(input: string[]): Promise<number[][]>;
  readonly dimensions: number;
}
```

Реализации: `JinaTextEmbedder`, `OpenAITextEmbedder`. Фабрика `createTextEmbedder(config)` создаёт нужный по конфигу.

### 10.2. Reranker interface

```typescript
interface Reranker {
  rerank(query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]>;
}

interface RerankDocument {
  id: string;
  content: string;
}

interface RerankResult {
  id: string;
  score: number;
  index: number;
}
```

Реализации: `JinaReranker`, `NoopReranker` (passthrough). Фабрика `createReranker(config)`.

### 10.3. Chunker interface

```typescript
interface Chunker {
  chunk(file: FileContent): Chunk[];
  supports(filePath: string): boolean;
}
```

Реализации: `TreeSitterChunker` (TS/JS), `TreeSitterFallbackChunker` (другие языки), `MarkdownChunker`, `FixedSizeChunker`.

Диспетчер `ChunkDispatcher` выбирает chunker по расширению файла.

---

## 11. Расширяемость

### 11.1. Граф зависимостей кода (будущее)

Архитектура позволяет добавить граф без рефакторинга:
- Новый модуль `src/graph/` с Neo4j или Apache AGE (PostgreSQL extension)
- Новый MCP-инструмент `traverse_graph`
- `ChunkMetadata` уже содержит `fqn` — основу для построения связей
- Связи (CALLS, CONTAINS, INHERITS) извлекаются из tree-sitter AST

### 11.2. Новые языки (tree-sitter)

Добавление нового языка:
1. Установить tree-sitter grammar (`tree-sitter-python`, etc.)
2. Написать query-файл в `src/chunks/code/queries/`
3. Зарегистрировать в `ChunkDispatcher`

До написания queries — язык обрабатывается `FallbackChunker`.

### 11.3. Новые провайдеры

Добавление нового embedding/reranker провайдера:
1. Реализовать `TextEmbedder` или `Reranker` interface
2. Добавить в фабрику
3. Добавить секцию в конфиг-схему

### 11.4. AI-суммаризация (будущее)

Если понадобится улучшить качество поиска:
- Флаг `--summarize` при индексации
- Добавить колонку `summary` в таблицу `chunks`
- Добавить второй named vector `summary_embedding`
- Dual-vector поиск (как в rag-core)

---

## 12. Ограничения и компромиссы

| Решение | Компромисс | Обоснование |
|---|---|---|
| **PostgreSQL вместо Qdrant** | pgvector менее зрелый для ANN при >100k векторов | Одна БД вместо двух. Для персонального инструмента ~10k чанков — достаточно |
| **Без суммаризации** | Потеря семантического поиска по описаниям | BM25 + rerank компенсируют. Экономия 10-50x на LLM-вызовах при индексации |
| **Без графа кода** | Нет навигации по связям (CALLS, INHERITS) | MVP без графа. Архитектура позволяет добавить позже |
| **Без очередей** | Индексация синхронная, блокирует CLI | Для персонального инструмента асинхронность не нужна |
| **Jina как внешняя зависимость** | Нет офлайн-режима для embeddings/rerank | Абстракция позволяет переключить на self-hosted. Гибридная модель |
| **stdio MCP** | Холодный старт при каждой сессии | Для PostgreSQL-подключения ~100ms. Приемлемо |
| **tree-sitter fallback** | Худшее качество чанков для не-TS/JS языков | Прагматичный старт. Queries добавляются по мере необходимости |

---

## 13. Зависимости (предварительные)

| Пакет | Назначение |
|---|---|
| `@modelcontextprotocol/sdk` | MCP-сервер (stdio transport) |
| `postgres` (porsager/postgres) | PostgreSQL-клиент |
| `pgvector` | Работа с vector типом |
| `tree-sitter` + `tree-sitter-typescript` | AST-парсинг кода |
| `zod` | Валидация конфига и MCP input/output |
| `yaml` | Парсинг YAML-конфига |
| `commander` | CLI-фреймворк |
| `ignore` | Парсинг .gitignore/.ragignore |
| `glob` / `fast-glob` | Поиск файлов по паттернам |
| `pdf-parse` | Извлечение текста из PDF |

---

## 14. Порядок реализации (предложение)

### Фаза 1: Ядро (поиск работает)
1. Инициализация проекта (tsconfig, package.json, ESM)
2. Конфиг (YAML + zod-схема)
3. PostgreSQL schema + миграции
4. Chunking: MarkdownChunker + FixedSizeChunker
5. Embeddings: JinaTextEmbedder
6. Storage: вставка чанков + pgvector + tsvector
7. Hybrid search: BM25 + vector + RRF
8. CLI: `rag init`, `rag index --path`

### Фаза 2: MCP + rerank
9. Jina Reranker
10. MCP-сервер (stdio) + 4 инструмента
11. Инкрементальная индексация (hash-сравнение)

### Фаза 3: Код
12. tree-sitter chunker (TS/JS)
13. Fallback chunker (другие языки)
14. Git-источники (клонирование)

### Фаза 4: Полировка
15. .gitignore + .ragignore фильтрация
16. CLI: `rag list`, `rag remove`, прогресс
17. OpenAI embedder (альтернативный провайдер)

---

## 15. Использование как глобальный MCP-сервер (Claude Code)

### 15.1. Проблема: CWD-зависимый поиск конфига

При запуске local-rag как **глобального** MCP-сервера (запись в `~/.claude.json` вместо `.mcp.json`
проекта) возникает проблема: `mcp-entry.ts` вызывает `loadConfig()` без аргументов, и поиск
конфига начинается с `./rag.config.yaml` — относительно **текущей рабочей директории** процесса.

При локальном использовании CWD совпадал с директорией проекта `local-rag`, где и лежит
`rag.config.yaml`. При глобальном запуске Claude Code устанавливает CWD произвольно (текущий
проект пользователя), файл не найден, сервер падает:

```
MCP server startup error: Jina embeddings config is required when provider is "jina"
```

Ошибка вводит в заблуждение: она сообщает о провале валидации конфига (дефолты не содержат
настройки Jina), а не об отсутствии файла конфига.

### 15.2. Текущее решение (обходной путь)

Скопировать `rag.config.yaml` в глобальный путь, который ищется третьим в порядке поиска:

```bash
mkdir -p ~/.config/rag
cp /path/to/local-rag/rag.config.yaml ~/.config/rag/config.yaml
```

Этот путь (`~/.config/rag/config.yaml`) корректно находится независимо от CWD.

**Недостатки обходного пути:**
- При изменении `rag.config.yaml` нужно помнить о ручном копировании
- Два файла конфига расходятся со временем
- Неочевидно для нового пользователя

### 15.3. Правильное решение (планируется)

Подробная спецификация изменений в коде: [docs/specs/config-path-resolution.md](docs/specs/config-path-resolution.md).

Краткое резюме: добавить поддержку флага `--config <path>` в `mcp-entry.ts` и переменной
окружения `RAG_CONFIG`. Это позволит явно указать путь к конфигу при регистрации сервера.

После реализации конфигурация в `~/.claude.json` будет выглядеть так:

```json
{
  "mcpServers": {
    "local-rag": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/abs/path/to/local-rag/dist/mcp-entry.js",
        "--config", "/abs/path/to/rag.config.yaml"
      ],
      "env": {
        "JINA_API_KEY": "your-key"
      }
    }
  }
}
```
