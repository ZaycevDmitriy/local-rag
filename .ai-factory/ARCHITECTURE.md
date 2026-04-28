# Architecture: Modular Monolith

## Overview
Local RAG использует модульный монолит — единый деплой (CLI + MCP server) с чёткими границами между модулями. Каждый модуль отвечает за одну область (chunking, search, storage, embeddings) и общается с другими через экспортируемый публичный API (barrel index.ts).

Этот паттерн выбран потому, что проект уже фактически следует ему: 10 модулей в src/ с минимальным перекрёстным coupling, два entry point (cli.ts, mcp-entry.ts) как composition roots.

## Decision Rationale
- **Project type:** CLI tool + MCP stdio server (single developer)
- **Tech stack:** TypeScript ESM, PostgreSQL, tree-sitter
- **Key factor:** Существующая структура уже модульная — формализуем правила, а не ломаем код

## Folder Structure
```
src/
├── cli.ts                  # Composition root: CLI (Commander)
├── mcp-entry.ts            # Composition root: MCP server (stdio)
├── chunks/                 # Модуль: разбиение файлов на фрагменты
│   ├── index.ts            # Публичный API: ChunkDispatcher, Chunk, ChunkMetadata
│   ├── markdown-chunker.ts
│   ├── fixed-size-chunker.ts
│   └── code/               # Подмодуль: AST-парсинг
│       ├── tree-sitter-chunker.ts
│       ├── fallback-chunker.ts
│       ├── ts-extractor.ts
│       ├── java-extractor.ts
│       ├── kotlin-extractor.ts
│       ├── extractor-types.ts
│       └── languages.ts
├── commands/               # Модуль: CLI команды (тонкий слой, делегирует в другие модули)
├── config/                 # Модуль: конфигурация (Zod-схема, YAML-загрузчик)
├── embeddings/             # Модуль: генерация векторов (TextEmbedder interface + реализации)
├── export/                 # Модуль: export/import (архивы, SQL, manifest)
├── indexer/                # Модуль: оркестрация индексации (зависит от chunks, embeddings, storage)
│   └── _helpers/           # Внутренние helper'ы indexer-модуля
├── mcp/                    # Модуль: MCP server + tool handlers
├── search/                 # Модуль: поисковый pipeline (BM25 + vector + RRF)
│   └── reranker/           # Подмодуль: реранкинг (Reranker interface + реализации)
├── sources/                # Модуль: сканирование файлов, git-операции
└── storage/                # Модуль: PostgreSQL (схема, миграции, CRUD)
    └── migrations/
```

## Dependency Rules

Зависимости направлены от entry points → оркестраторы → leaf-модули.

```
cli.ts / mcp-entry.ts          (composition roots)
    ↓
commands/ / mcp/                (тонкие адаптеры)
    ↓
indexer/ / search/              (оркестраторы)
    ↓
chunks/ embeddings/ sources/    (leaf-модули с бизнес-логикой)
storage/                        (инфраструктура, используется многими)
config/                         (конфигурация, используется всеми)
```

- **chunks/** → зависит только от config (размеры чанков)
- **embeddings/** → зависит только от config (API ключи, провайдер)
- **search/** → зависит от storage, embeddings, config
- **indexer/** → зависит от chunks, embeddings, storage, sources, config
- **commands/** → зависит от indexer, search, storage, export, config
- **mcp/** → зависит от search, storage, config
- **export/** → зависит от storage, config
- **storage/** → зависит только от config

- storage/ НЕ зависит от chunks, embeddings, search
- chunks/ НЕ зависит от storage, embeddings
- embeddings/ НЕ зависит от storage, chunks
- sources/ НЕ зависит от storage, chunks, embeddings

## Layer/Module Communication
- Модули общаются через TypeScript interfaces (TextEmbedder, Reranker, Chunker)
- Factory-функции создают конкретные реализации по конфигу
- Composition roots (cli.ts, mcp-entry.ts) собирают зависимости и передают в оркестраторы
- Между модулями НЕТ event bus — прямые вызовы через interfaces

## Key Principles

1. **Публичный API через barrel exports** — каждый модуль экспортирует только нужное через index.ts. Внутренние детали реализации не импортируются напрямую из других модулей.

2. **Программирование на интерфейсах** — TextEmbedder, Reranker, Chunker определяют контракты. Реализации (JinaTextEmbedder, OpenAITextEmbedder) подставляются через factory.

3. **Config как единственный источник правды** — все параметры (провайдеры, веса, размеры) определяются в rag.config.yaml с Zod-валидацией. Модули получают типизированный конфиг, а не читают env напрямую.

4. **Graceful degradation** — optional dependencies (tree-sitter-java, tree-sitter-kotlin) загружаются через try/catch с кэшированием ошибок. Отсутствие грамматики не ломает систему.

## Code Examples

### Паттерн: Interface + Factory
```typescript
// embeddings/types.ts — интерфейс
export interface TextEmbedder {
  embed(input: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

// embeddings/factory.ts — фабрика по конфигу
export function createEmbedder(config: EmbeddingsConfig): TextEmbedder {
  switch (config.provider) {
    case 'jina': return new JinaTextEmbedder(config);
    case 'openai': return new OpenAITextEmbedder(config);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

### Паттерн: Composition Root
```typescript
// cli.ts — собирает зависимости
const config = await loadConfig();
const db = createDb(config.database);
const embedder = createEmbedder(config.embeddings);
const reranker = createReranker(config.reranker);
const indexer = new Indexer(db, embedder, config);
const coordinator = new SearchCoordinator(db, embedder, reranker, config.search);
```

### Паттерн: Модуль не знает о внешних зависимостях
```typescript
// chunks/code/tree-sitter-chunker.ts — зависит только от типов
export class TreeSitterChunker implements Chunker {
  // НЕ импортирует storage, embeddings, search
  // Работает только с файлами → возвращает Chunk[]
  chunk(content: string, filePath: string): Chunk[] { ... }
  supports(filePath: string): boolean { ... }
}
```

## Anti-Patterns
- Импорт внутренних файлов модуля напрямую (например, `import { X } from '../storage/migrations/001_initial'` вместо `from '../storage'`)
- Циклические зависимости между модулями (chunks ↔ storage)
- Бизнес-логика в commands/ или mcp/ — это тонкие адаптеры, логика живёт в оркестраторах (indexer, search)
- Прямое чтение env vars в модулях — всё через config
- God-module: один модуль, который зависит от всех остальных (кроме composition roots)
