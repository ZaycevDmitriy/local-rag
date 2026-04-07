# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
Local RAG — personal semantic search system for code and documentation. Indexes local directories and Git repositories, provides hybrid search (BM25 + vector + rerank) via MCP interface for AI agents.

## Tech Stack
- **Language:** TypeScript (ESM, strict mode)
- **Runtime:** Node.js >= 18
- **Database:** PostgreSQL with pgvector extension
- **Embeddings:** Jina Embeddings v3 (1024d), OpenAI, SiliconFlow as alternatives
- **Reranking:** Jina Reranker v2, SiliconFlow as alternative
- **AST Parsing:** tree-sitter (TS/JS/Java/Kotlin)
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **CLI:** Commander.js
- **Config:** YAML with Zod validation
- **Testing:** Vitest
- **Linting:** ESLint v10 (flat config)

## Project Structure
```
src/
  cli.ts                # CLI entry point (Commander, 9 commands)
  mcp-entry.ts          # MCP server entry point (stdio)
  chunks/               # Chunking: markdown, fixed-size, tree-sitter, fallback
    code/               # AST extractors: ts, java, kotlin, languages, types
  commands/             # CLI commands: init, index, list, remove, status, export, import, re-embed, gc
  config/               # Zod schema, YAML loader, defaults
  embeddings/           # TextEmbedder interface, Jina/OpenAI/SiliconFlow implementations, factory
  export/               # Export/import v2: manifest, archive (tar.gz), SQL (6 tables), sanitizer
  indexer/              # Branch-aware indexing: snapshot detection, view reconciliation, blob/content dedup
  mcp/                  # MCP server + 4 tool handlers (search supports optional branch parameter)
  search/               # Branch-aware hybrid search: BM25 + vector (narrow/broad) + RRF + dedup
    reranker/           # Reranker interface, Jina/SiliconFlow/Noop implementations, factory
  sources/              # File scanning, .gitignore/.ragignore filtering, git clone/pull, snapshot fingerprints
    fingerprint.ts      # Snapshot fingerprint generation (tree/dirty/workspace formats)
    git.ts              # Local git analysis (11 methods: resolveRepoContext, getCurrentRef, etc.)
  status/               # SystemStatusSnapshot: sources, views, blobs, chunk_contents, embeddings stats
  storage/              # PostgreSQL: 6-table schema, migrations 001-005, one storage class per table
    migrations/         # SQL migrations (001-004: initial schema; 005: branch_views_rebuild, destructive)
    sources.ts          # SourceStorage
    source-views.ts     # SourceViewStorage (branch/workspace snapshots)
    file-blobs.ts       # FileBlobStorage (file body dedup)
    indexed-files.ts    # IndexedFileStorage (per source_view)
    chunk-contents.ts   # ChunkContentStorage (content + embedding dedup, BM25/vector search methods)
    chunks.ts           # ChunkStorage (occurrence-level rows)
  utils/                # Утилиты: retry с backoff, concurrency limiter
tests/                  # Vitest tests (471+ tests)
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry — Commander with 8 subcommands |
| `src/mcp-entry.ts` | MCP stdio server entry |
| `src/config/loader.ts` | Config loading (YAML + Zod validation + env var interpolation) |
| `src/storage/schema.ts` | Database schema + row types (6 tables: sources, source_views, file_blobs, indexed_files, chunk_contents, chunks) |
| `src/search/coordinator.ts` | Search pipeline orchestration (BM25 + vector + RRF + rerank) |
| `src/indexer/indexer.ts` | Incremental indexing orchestrator |
| `rag.config.yaml` | Project configuration |

## Documentation
| Document | Path | Description |
|----------|------|-------------|
| README | README.md | Project landing page |
| CLI-команды | docs/cli.md | Full CLI reference |
| Конфигурация | docs/configuration.md | rag.config.yaml, providers, filtering |
| MCP-интеграция | docs/mcp-integration.md | Claude Code, Cursor setup |
| Архитектура | docs/architecture.md | Search pipeline, chunking, tech stack |
| Разработка | docs/development.md | Project structure, dev commands |
| AI Factory | docs/ai-factory-workflow.md | AI-driven development workflow |

## AI Context Files
| File | Purpose |
|------|---------|
| AGENTS.md | This file — project structure map |
| .ai-factory/DESCRIPTION.md | Project specification and tech stack |
| .ai-factory/ARCHITECTURE.md | Architecture decisions and guidelines |
| CLAUDE.md | Agent instructions and preferences |

## Agent Rules
- Always communicate with the user only in Russian unless the user explicitly asks to switch to another language.
- Never combine shell commands with `&&`, `||`, or `;` — execute each command as a separate Bash tool call. This applies even when a skill, plan, or instruction provides a combined command — always decompose it into individual calls.
  - Wrong: `git checkout main && git pull`
  - Right: Two separate Bash tool calls — first `git checkout main`, then `git pull`
