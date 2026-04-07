# Project: Local RAG

## Overview
Personal semantic search system for code and documentation. Indexes local directories and Git repositories, provides hybrid search (BM25 + vector + rerank) via MCP interface for AI agents (Claude Code, Cursor).

## Core Features
- Branch-aware indexing: independent snapshots per git branch/workspace with deduplication across branches
- Hybrid search: BM25 full-text + vector similarity (narrow/broad modes) + RRF fusion + Jina reranking
- Content-level dedup in search: one occurrence per unique chunk_content_hash per view before RRF
- AST-aware code chunking via tree-sitter (TypeScript, JavaScript, Java, Kotlin) with fallback
- Markdown chunking by headers, fixed-size chunking for plain text/PDF
- MCP stdio server with 4 tools (search with optional `branch` parameter, read_source, list_sources, status)
- CLI with 9 commands (init, index, list, remove, status, export, import, re-embed, gc)
- Export/import v2 for backup and data transfer (tar.gz archives + SQL, 6-table schema)
- Garbage collection (`rag gc`) for orphan file_blobs and chunk_contents
- Multi-provider embeddings (Jina, OpenAI, SiliconFlow)
- .gitignore/.ragignore file filtering

## Tech Stack
- **Language:** TypeScript (ESM, strict mode)
- **Runtime:** Node.js >= 18
- **Database:** PostgreSQL with pgvector extension
- **Embeddings:** Jina Embeddings v3 (1024d), OpenAI and SiliconFlow as alternatives
- **Reranking:** Jina Reranker v2, SiliconFlow as alternative
- **AST Parsing:** tree-sitter (TS/JS/Java/Kotlin)
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **CLI:** Commander.js
- **Config:** YAML with Zod validation
- **Testing:** Vitest
- **Linting:** ESLint v10 (flat config)
- **Build:** tsc (TypeScript compiler)

## Architecture
See `.ai-factory/ARCHITECTURE.md` for detailed architecture guidelines.
Pattern: Modular Monolith

### Key Notes
- Two-process model: CLI for indexing, MCP server for search
- Single PostgreSQL database shared between both processes (6 tables: sources, source_views, file_blobs, indexed_files, chunk_contents, chunks)
- HNSW index on chunk_contents.embedding, GIN index on chunk_contents.search_vector
- TextEmbedder/Reranker/Chunker abstractions for provider swapping
- Config via rag.config.yaml with env var interpolation (${ENV_VAR})
- Branch-aware storage: logical sources → source_views (branch/workspace snapshots) → file_blobs + chunk_contents (deduplicated) → chunks (occurrence-level)
- active_view_id on sources determines the default search surface per source

## Non-Functional Requirements
- Incremental indexing for large codebases (~18K chunks for ~6K files)
- Graceful degradation when optional tree-sitter grammars are not installed
- Configurable search weights (BM25/vector), RRF k, topK parameters
- SQL export uses E-string syntax for proper newline escaping
