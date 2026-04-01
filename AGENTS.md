# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
Local RAG — personal semantic search system for code and documentation. Indexes local directories and Git repositories, provides hybrid search (BM25 + vector + rerank) via MCP interface for AI agents.

## Tech Stack
- **Language:** TypeScript (ESM, strict mode)
- **Runtime:** Node.js >= 18
- **Database:** PostgreSQL with pgvector extension
- **Embeddings:** Jina Embeddings v3 (1024d), OpenAI as alternative
- **Reranking:** Jina Reranker v2
- **AST Parsing:** tree-sitter (TS/JS/Java/Kotlin)
- **MCP:** @modelcontextprotocol/sdk (stdio transport)
- **CLI:** Commander.js
- **Config:** YAML with Zod validation
- **Testing:** Vitest
- **Linting:** ESLint v10 (flat config)

## Project Structure
```
src/
  cli.ts                # CLI entry point (Commander, 8 commands)
  mcp-entry.ts          # MCP server entry point (stdio)
  chunks/               # Chunking: markdown, fixed-size, tree-sitter, fallback
    code/               # AST extractors: ts, java, kotlin, languages, types
  commands/             # CLI commands: init, index, list, remove, status, export, import, re-embed
  config/               # Zod schema, YAML loader, defaults
  embeddings/           # TextEmbedder interface, Jina/OpenAI implementations, factory
  export/               # Export/import: manifest, archive (tar.gz), SQL, sanitizer
  indexer/              # Incremental indexing, hash comparison, progress
  mcp/                  # MCP server + 4 tool handlers (search, read_source, list_sources, status)
  search/               # Hybrid search: BM25 + vector + RRF fusion
    reranker/           # Reranker interface, Jina/Noop implementations, factory
  sources/              # File scanning, .gitignore/.ragignore filtering, git clone/pull
  storage/              # PostgreSQL: schema, migrations, CRUD for chunks/sources/indexed-files
    migrations/         # SQL migrations (001-004: initial, vector_dims, path_index, metadata_indexes)
  utils/                # Утилиты: retry с backoff, concurrency limiter
tests/                  # Vitest tests (400 tests)
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry — Commander with 8 subcommands |
| `src/mcp-entry.ts` | MCP stdio server entry |
| `src/config/loader.ts` | Config loading (YAML + Zod validation + env var interpolation) |
| `src/storage/schema.ts` | Database schema (sources, chunks, indexed_files) |
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
