# Project: Local RAG

## Overview
Personal semantic search system for code and documentation. Indexes local directories and Git repositories, provides hybrid search (BM25 + vector + rerank) via MCP interface for AI agents (Claude Code, Cursor).

## Core Features
- Hybrid search: BM25 full-text + vector similarity + RRF fusion + Jina reranking
- AST-aware code chunking via tree-sitter (TypeScript, JavaScript, Java, Kotlin) with fallback
- Markdown chunking by headers, fixed-size chunking for plain text/PDF
- Incremental indexing with SHA-256 hash comparison
- MCP stdio server with 4 tools (search, read_source, list_sources, status)
- CLI with 8 commands (init, index, list, remove, status, export, import, re-embed)
- Export/import for backup and data transfer (tar.gz archives + SQL)
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
- Single PostgreSQL database shared between both processes
- HNSW index on embeddings, GIN index on tsvector
- TextEmbedder/Reranker/Chunker abstractions for provider swapping
- Config via rag.config.yaml with env var interpolation (${ENV_VAR})

## Non-Functional Requirements
- Incremental indexing for large codebases (~18K chunks for ~6K files)
- Graceful degradation when optional tree-sitter grammars are not installed
- Configurable search weights (BM25/vector), RRF k, topK parameters
- SQL export uses E-string syntax for proper newline escaping
