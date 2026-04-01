# Project Roadmap

> Персональная система семантического поиска по коду и документации с hybrid search через MCP-интерфейс для AI-агентов.

## Milestones

- [ ] **Python tree-sitter extractor** — AST-парсинг Python: функции, классы, декораторы, docstrings
- [ ] **Go tree-sitter extractor** — AST-парсинг Go: functions, structs, interfaces, methods with receivers
- [ ] **Rust tree-sitter extractor** — AST-парсинг Rust: impl blocks, traits, macros, lifetime annotations
- [ ] **Self-hosted embeddings (Ollama)** — реализация TextEmbedder для локальных моделей (stub уже в factory.ts)
- [ ] **Code dependency graph** — граф связей (CALLS, INHERITS) через tree-sitter AST, новый MCP tool traverse_graph (spec 11.1)
- [ ] **AI-powered summarization** — LLM-генерация описаний чанков, dual-vector search по content + summary (spec 11.4)
- [ ] **Async indexing queue** — фоновая индексация с прогрессом, снятие блокировки CLI (spec 12)
- [ ] **Web UI** — HTTP-сервер для просмотра sources, тестирования запросов, статистики
- [x] **Core: config, storage, chunking, search, CLI** — PostgreSQL + pgvector, markdown/fixed chunking, Jina embeddings, hybrid search (BM25+vector+RRF), CLI init/index
- [x] **MCP server + Jina reranker** — MCP stdio с 4 tools, incremental indexing, reranking pipeline
- [x] **Tree-sitter code chunking** — AST-парсинг TS/JS, fallback chunker, Git sources
- [x] **Polish: filtering, CLI, OpenAI** — .gitignore/.ragignore, CLI list/remove/status, OpenAI embedder
- [x] **Extractor infrastructure** — ts-extractor, extractor-types, languages.ts с graceful degradation
- [x] **Java tree-sitter** — java-extractor с FQN, Javadoc, аннотациями
- [x] **Kotlin tree-sitter** — kotlin-extractor с extension functions, companion objects
- [x] **Config path resolution** — --config arg, RAG_CONFIG env var, resolveConfigPath
- [x] **Export/Import/Re-embed** — tar.gz архивы, SQL export/import, перегенерация эмбеддингов
- [x] **Optimization & reliability** — retry/overlap/concurrency утилиты, parallel embeddings, source cache, metadata indexes, keyset pagination, unit tests (381)

## Completed

| Milestone | Date |
|-----------|------|
| Core: config, storage, chunking, search, CLI | 2025-10-15 |
| MCP server + Jina reranker | 2025-10-20 |
| Tree-sitter code chunking | 2025-11-01 |
| Polish: filtering, CLI, OpenAI | 2025-11-10 |
| Extractor infrastructure | 2025-12-01 |
| Java tree-sitter | 2025-12-15 |
| Kotlin tree-sitter | 2026-01-10 |
| Config path resolution | 2026-01-20 |
| Export/Import/Re-embed | 2026-02-15 |
| Optimization & reliability | 2026-03-14 |
