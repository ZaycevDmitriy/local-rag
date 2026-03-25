# Implementation Plan: Phase 10 — Оптимизация, надёжность, тесты, качество кода

Branch: refactor/phase-10-optimization
Created: 2026-03-14
Refined: 2026-03-14

## Settings
- Testing: yes
- Logging: standard
- Docs: yes

## Commit Plan

- **Commit 1** (after tasks 1-3): `refactor: extract retry, overlap, concurrency utilities`
- **Commit 2** (after tasks 4-6): `perf: multi-row insert, parallel embeddings, source cache`
- **Commit 3** (after tasks 7-8): `fix: DB health-check, error aggregation for --all`
- **Commit 4** (after tasks 9-10): `test: unit tests for SearchCoordinator and Indexer`
- **Commit 5** (after tasks 11-12): `perf: metadata indexes, keyset pagination in export`

## Tasks

### Phase 1: Утилиты (foundations)

- [x] Task 1: Утилита fetchWithRetry — `src/utils/retry.ts`
  - Извлечь retry из 3 файлов: `src/embeddings/jina.ts`, `src/search/reranker/jina.ts`, `src/embeddings/openai.ts`
  - AbortSignal.timeout для HTTP timeout
  - Должна работать с vi.useFakeTimers() (тесты jina/reranker зависят)
  - Тесты: `src/utils/__tests__/retry.test.ts`
- [x] Task 2: Утилита computeOverlap — `src/chunks/overlap.ts`
  - Извлечь из 4 файлов: `fixed-chunker.ts`, `tree-sitter-chunker.ts`, `fallback-chunker.ts`, `markdown-chunker.ts`
  - Тесты: `src/chunks/__tests__/overlap.test.ts`
- [x] Task 3: Утилита pMap — `src/utils/concurrency.ts`
  - Параллельное выполнение с ограничением concurrency
  - Тесты: `src/utils/__tests__/concurrency.test.ts`

<!-- Commit checkpoint: refactor: extract retry, overlap, concurrency utilities -->

### Phase 2: Производительность

- [x] Task 4: Multi-row INSERT в insertBatch — `src/storage/chunks.ts`
  - Исследовать возможности пакета `postgres` (sql helper, UNNEST, sql.unsafe)
  - Ограничение: ::vector cast и sql.json() несовместимы со стандартным multi-row helper
  - Если невозможно — оставить с комментарием, реалистичная оценка 2-5x
- [x] Task 5: Параллельная генерация эмбеддингов — `src/indexer/indexer.ts` (depends on 3)
  - pMap с EMBED_CONCURRENCY=3
  - Атомарный счётчик completedChunks для прогресса (не менять интерфейс ProgressReporter)
- [x] Task 6: Кэш sources в SearchCoordinator — `src/search/coordinator.ts`
  - Только TTL кэш (5 мин), БЕЗ invalidateSourceCache() (CLI/MCP — разные процессы)

<!-- Commit checkpoint: perf: multi-row insert, parallel embeddings, source cache -->

### Phase 3: Надёжность

- [x] Task 7: Health-check БД при старте MCP — `src/mcp-entry.ts`
  - SELECT 1 после createDb()
- [x] Task 8: Агрегация ошибок при --all — `src/commands/index-cmd.ts`
  - try/catch per source, итоговый summary (N ok, M failed)

<!-- Commit checkpoint: fix: DB health-check, error aggregation for --all -->

### Phase 4: Тестирование

- [x] Task 9: Unit-тесты SearchCoordinator (depends on 6)
  - `src/search/__tests__/coordinator.test.ts` — 10 тестов
- [x] Task 10: Unit-тесты Indexer (depends on 5)
  - `src/indexer/__tests__/indexer.test.ts` — 9 тестов

<!-- Commit checkpoint: test: unit tests for SearchCoordinator and Indexer -->

### Phase 5: DX

- [x] Task 11: DB-индексы — `src/storage/migrations/004_metadata_indexes.ts`
  - idx_chunks_source_type (metadata->>'sourceType')
  - idx_chunks_language (metadata->>'language')
  - idx_chunks_source_created (source_id, created_at) — для keyset pagination
- [x] Task 12: Keyset pagination в export — `src/export/exporter.ts` (depends on 11)
  - Заменить LIMIT/OFFSET на (created_at, id) > cursor
  - Требует индекс (source_id, created_at) из Task 11

<!-- Commit checkpoint: perf: metadata indexes, keyset pagination in export -->

## Files Changed

| File | Tasks |
|------|-------|
| `src/storage/chunks.ts` | 4 |
| `src/indexer/indexer.ts` | 5 |
| `src/search/coordinator.ts` | 6 |
| `src/mcp-entry.ts` | 7 |
| `src/embeddings/jina.ts` | 1 |
| `src/embeddings/openai.ts` | 1 |
| `src/search/reranker/jina.ts` | 1 |
| `src/commands/index-cmd.ts` | 8 |
| `src/chunks/text/fixed-chunker.ts` | 2 |
| `src/chunks/code/tree-sitter-chunker.ts` | 2 |
| `src/chunks/code/fallback-chunker.ts` | 2 |
| `src/chunks/markdown/markdown-chunker.ts` | 2 |
| `src/export/exporter.ts` | 12 |
| `src/storage/migrator.ts` | 11 |

## New Files

| File | Task |
|------|------|
| `src/utils/retry.ts` | 1 |
| `src/utils/concurrency.ts` | 3 |
| `src/chunks/overlap.ts` | 2 |
| `src/storage/migrations/004_metadata_indexes.ts` | 11 |
| `src/utils/__tests__/retry.test.ts` | 1 |
| `src/utils/__tests__/concurrency.test.ts` | 3 |
| `src/chunks/__tests__/overlap.test.ts` | 2 |
| `src/search/__tests__/coordinator.test.ts` | 9 |
| `src/indexer/__tests__/indexer.test.ts` | 10 |

## Verification

1. `npm run typesCheck` — без ошибок
2. `npm test` — все 336+ тестов + ~35 новых проходят
3. `npm run lint` — без ошибок
4. `npm run build` — сборка успешна
5. `rag init` — миграция 004 применяется
6. `rag index --all` — индексация работает, проверить скорость
7. MCP tools через mcp-inspector — search/status работают
