# Implementation Plan: Branch-Aware Indexing for Local Git-Backed Sources

Branch: feature/branch-aware-indexing
Created: 2026-04-02
Improved: 2026-04-04

## Settings
- Testing: yes
- Logging: verbose
- Docs: yes
- Planning assumptions: user preferences were not specified, so recommended defaults were applied (`Testing=yes`, `Logging=verbose`, `Docs=yes`).

## Roadmap Linkage
Milestone: "none"
Rationale: Current `ROADMAP.md` does not contain a matching milestone for branch-aware indexing, snapshot persistence, or search-surface rebuild, so the plan is intentionally left unlinked.

## Research Context
Source: `.ai-factory/RESEARCH.md` (Active Summary)

Goal:
- Introduce a mature branch-aware storage model for local git-backed sources, preserving independent branch snapshots and deduplicating chunk content and embeddings across branches.

Constraints:
- Backward compatibility of stored data is not required; schema cutover is allowed.
- `read_source` must work for inactive branches without reading the live checkout.
- Public `chunkId` must remain occurrence-level to preserve coordinates and source lookup semantics.
- Search defaults must use each source's active view, while branch/view remains an explicit API dimension.

Key decisions carried into planning:
- Split logical `sources` from materialized `source_views`.
- Move incremental indexing scope from `source_id` to `source_view_id`.
- Store snapshot file bodies in `file_blobs`.
- Deduplicate content in `chunk_contents`, while keeping occurrence rows in `chunks`.
- Enforce integrity with composite FKs for `active_view_id` and `(source_view_id, indexed_file_id)`.
- Use `content_hash TEXT` as the primary key of `chunk_contents`.
- Treat `pathPrefix` and `sourceType` as hard filters in vector search.
- Implement `rag gc` for orphan cleanup instead of inline deletion.

Resolved questions:
- Export/import v2 включён в первую итерацию (Task 10, Phase 4).

Open questions to resolve during implementation:
- Which BM25 query shape wins on real planner statistics.
- What threshold should switch vector search from narrow exact mode to broad ANN overfetch.

## Commit Plan
- **Commit 1** (after tasks 1-3): `feat: add branch-aware storage foundation`
- **Commit 2a** (after tasks 4-5): `feat: implement snapshot indexing pipeline`
- **Commit 2b** (after tasks 6-7): `feat: add search benchmarks and branch-aware query strategies`
- **Commit 3a** (after tasks 8-9): `feat: rework read/list/status surfaces and add garbage collection`
- **Commit 3b** (after task 10): `feat: upgrade export/import to schema v2`
- **Commit 3c** (after task 11): `test: add regression tests and documentation checkpoint`

## Tasks

### Phase 1: Storage Foundation

#### ~~Task 1: Rebuild database schema around logical sources, views, blobs, and occurrence rows~~ [x]
Deliverable:
Create migration `005_branch_views_rebuild` and update `src/storage/schema.ts` and `src/storage/index.ts` so the storage module exposes the new row types and migrations for `sources`, `source_views`, `file_blobs`, `indexed_files`, `chunk_contents`, and occurrence-level `chunks`.

Конкретные изменения в таблице `sources`:
- УДАЛИТЬ колонки `git_branch` и `chunk_count` (chunk_count переносится на `source_views`).
- ДОБАВИТЬ колонки `repo_root_path TEXT`, `repo_subpath TEXT`, `active_view_id UUID`.
- Добавить composite FK: `FOREIGN KEY (id, active_view_id) REFERENCES source_views(source_id, id) ON DELETE SET NULL (active_view_id)`.

Таблица `source_views` (новая):
- Колонки: `id UUID PK`, `source_id UUID NOT NULL`, `view_kind TEXT NOT NULL`, `ref_name TEXT`, `head_commit_oid TEXT`, `head_tree_oid TEXT`, `subtree_oid TEXT`, `dirty BOOLEAN NOT NULL DEFAULT FALSE`, `snapshot_fingerprint TEXT NOT NULL`, `file_count INTEGER NOT NULL DEFAULT 0`, `chunk_count INTEGER NOT NULL DEFAULT 0`, `last_seen_at TIMESTAMPTZ`, `last_indexed_at TIMESTAMPTZ`, `created_at`, `updated_at`.
- `UNIQUE(source_id, id)` -- опорный ключ для composite FK из `sources`.
- `UNIQUE(source_id, view_kind, ref_name)` для branch/detached.
- Partial unique index `(source_id, view_kind) WHERE view_kind = 'workspace'`.

Таблица `file_blobs` (новая):
- `content_hash TEXT PRIMARY KEY`, `content TEXT NOT NULL`, `byte_size INTEGER NOT NULL`, `created_at`.

Таблица `indexed_files` (переработка):
- Заменить `source_id` на `source_view_id UUID NOT NULL REFERENCES source_views(id) ON DELETE CASCADE`.
- Удалить `file_hash` (заменяется на `content_hash TEXT NOT NULL REFERENCES file_blobs(content_hash)`).
- `UNIQUE(source_view_id, path)`, `UNIQUE(source_view_id, id)` -- опорный ключ для composite FK из `chunks`.

Таблица `chunk_contents` (новая):
- `content_hash TEXT PRIMARY KEY`, `content TEXT NOT NULL`, `embedding vector(<configured_dimensions>)`, `search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED`.
- HNSW-индекс на `embedding`, GIN-индекс на `search_vector`.

Таблица `chunks` (переработка):
- Заменить `source_id` на `source_view_id UUID NOT NULL`.
- Заменить `content`/`embedding`/`search_vector` на `chunk_content_hash TEXT NOT NULL REFERENCES chunk_contents(content_hash) ON DELETE RESTRICT`.
- Добавить `indexed_file_id UUID NOT NULL`.
- Promote из JSONB `metadata` в proper columns: `path TEXT NOT NULL`, `source_type TEXT NOT NULL`, `start_line INTEGER`, `end_line INTEGER`, `header_path TEXT`, `language TEXT`. Оставить `metadata JSONB NOT NULL DEFAULT '{}'` для дополнительных полей.
- Добавить `ordinal INTEGER NOT NULL` — позиция чанка внутри файла.
- Добавить composite FK: `FOREIGN KEY (source_view_id, indexed_file_id) REFERENCES indexed_files(source_view_id, id) ON DELETE CASCADE`.
- `UNIQUE(indexed_file_id, ordinal)`.

Миграция `005_branch_views_rebuild` должна быть destructive cutover: DROP + CREATE для всех таблиц (обратная совместимость данных не требуется). Таблица `_migrations` НЕ удаляется — записи миграций 001-004 сохраняются как history. Миграция 005 добавляется стандартным путём через `migrator.ts`.

Реализация migration factory:
Миграция 005 реализуется как factory function `createBranchViewsRebuildMigration(dimensions: number): Migration` аналогично текущей 002 (`createVectorDimensionsMigration`), потому что `chunk_contents.embedding vector(<dimensions>)` зависит от runtime-конфига провайдера. Обновить `src/commands/init.ts` — добавить импорт factory и включить 005 в массив миграций (после 004). Extensions `pgvector`, `pgcrypto`, `pg_trgm` уже существуют (создаются миграциями 001, 003) — 005 не пересоздаёт их.

Новые и обновлённые row types в `schema.ts`:
- `SourceRow` (обновить): добавить `repo_root_path`, `repo_subpath`, `active_view_id`; удалить `git_branch`, `chunk_count`.
- `SourceViewRow` (новый): `id`, `source_id`, `view_kind`, `ref_name`, `head_commit_oid`, `head_tree_oid`, `subtree_oid`, `dirty`, `snapshot_fingerprint`, `file_count`, `chunk_count`, `last_seen_at`, `last_indexed_at`, `created_at`, `updated_at`.
- `FileBlobRow` (новый): `content_hash`, `content`, `byte_size`, `created_at`.
- `IndexedFileRow` (обновить): заменить `source_id` → `source_view_id`, заменить `file_hash` → `content_hash`.
- `ChunkContentRow` (новый): `content_hash`, `content`, `embedding`, `created_at` (search_vector — generated, не в row type).
- `ChunkRow` (обновить): заменить `source_id` → `source_view_id`, удалить `content`/`embedding`/`search_vector`; добавить `chunk_content_hash`, `indexed_file_id`, `path`, `source_type`, `start_line`, `end_line`, `header_path`, `language`, `ordinal`, `metadata`.

Files:
`src/storage/migrations/005_branch_views_rebuild.ts`, `src/storage/schema.ts`, `src/storage/index.ts`, `src/storage/migrator.ts` (добавить `005_branch_views_rebuild` в массив миграций `migrations`), `src/commands/init.ts` (добавить импорт и регистрацию миграции 005), `src/storage/__tests__/migrations.test.ts` (новая директория `src/storage/__tests__/` создаётся в этой задаче).

Testing:
Unit тест (`src/storage/__tests__/migrations.test.ts`): идемпотентность миграции (повторный apply не ломает schema), корректность таблиц и колонок после apply, наличие индексов (HNSW, GIN), composite FK constraints. Директория `src/storage/__tests__/` сейчас не существует — создаётся как часть этой задачи.

Logging requirements:
Add verbose DEBUG/INFO logs around migration start, table creation order, schema version transitions, and destructive cutover checkpoints; log ERROR with migration name and failing statement context.

Dependency notes:
This task is the hard prerequisite for every other task.

#### ~~Task 2: Implement new storage repositories and shared query types~~ [x]
Deliverable:
Replace the current source/chunk/indexed-file repositories with branch-aware storage classes for `SourceStorage`, `SourceViewStorage`, `FileBlobStorage`, `IndexedFileStorage`, `ChunkContentStorage`, and `ChunkStorage`. Типы фильтров и query types, используемые только storage- и indexer-модулями, определяются здесь. Типы, специфичные для search pipeline (`SearchFilters`, `ScoredChunkOccurrence`), НЕ входят в эту задачу -- они обновляются в Task 7.

Storage API методы -- строго по RESEARCH.md Section 3:
- `SourceStorage`: upsertDefinition, getById, getByName, getAll, remove, setActiveView, updateLastIndexedAt.
- `SourceViewStorage`: getWorkspaceView, getRefView, upsertView, listBySource, deleteMissingBranchViews, updateAfterIndex, resolveDefaultViews.
- `FileBlobStorage`: upsertMany, getByHash, deleteOrphans.
- `IndexedFileStorage`: getByView, getByPath, upsertMany, deleteByPaths, deleteByIds.
- `ChunkContentStorage`: insertBatch (void return), getByHashes, getWithNullEmbedding, updateEmbeddings, deleteOrphans.
- `ChunkStorage`: insertBatch, deleteByIndexedFileIds, getByIds, findByHeaderPath, countByView.

Files:
`src/storage/sources.ts`, `src/storage/source-views.ts` (new), `src/storage/file-blobs.ts` (new), `src/storage/indexed-files.ts`, `src/storage/chunk-contents.ts` (new), `src/storage/chunks.ts`, `src/storage/index.ts`, `src/storage/__tests__/source-views.test.ts` (new), `src/storage/__tests__/file-blobs.test.ts` (new), `src/storage/__tests__/chunk-contents.test.ts` (new).

Testing:
Integration тесты (PostgreSQL): `source-views.test.ts` — upsertView, listBySource, deleteMissingBranchViews, resolveDefaultViews, partial unique constraint для workspace; `file-blobs.test.ts` — upsertMany с dedup (ON CONFLICT DO NOTHING), getByHash, deleteOrphans с grace period; `chunk-contents.test.ts` — insertBatch void return с dedup, getByHashes, getWithNullEmbedding, updateEmbeddings, deleteOrphans с grace period.

Logging requirements:
Log repository method entry and exit for mutation paths, row counts for batch upserts/deletes, fallback branches in query strategy selection, and ERROR logs with operation name plus key identifiers (`sourceId`, `viewId`, `contentHash`).

Компиляционная совместимость:
Текущий `SearchCoordinator` вызывает `chunkStorage.searchBm25()` / `chunkStorage.searchVector()`. Чтобы `npm run typesCheck` проходил между Tasks 2-6, новый `ChunkStorage` должен экспортировать stub-методы `searchBm25` и `searchVector`, которые бросают `Error('Branch-aware search: будет реализовано в Task 7')`. Stub-ы удаляются при реализации Task 7. Аналогично, `ChunkStorage.getByIds`, `ChunkStorage.findByHeaderPath`, `ChunkStorage.countBySource` должны быть реализованы полноценно уже в этой задаче — они нужны для MCP read_source и status.

Dependency notes:
Depends on Task 1. Keep module boundaries clean by exporting only through `src/storage/index.ts`. Search-related types (`SearchFilters`, `ScoredChunkOccurrence`, search methods `searchBm25`, `searchVector`, `getContentHashes`) добавляются в Task 7, заменяя stub-ы из этой задачи.

#### ~~Task 3: Extend git source discovery to resolve branch/detached snapshots, subpath state, and snapshot fingerprints~~ [x]
Deliverable:
Расширить `src/sources/git.ts` до snapshot-discovery сервиса, сохраняя существующие функции для remote git (`cloneOrPull`, `extractRepoName`, `expandHome`). Добавить 11 новых методов для локального git-анализа (per RESEARCH.md Section 4):

1. `resolveRepoContext(path)` -- resolve `repoRoot` и `repoSubpath`.
2. `getCurrentRef(repoRoot)` -- resolve `viewKind` ('branch' | 'detached') и `refName`.
3. `listLocalBranches(repoRoot)` -- список локальных веток.
4. `getHeadCommit(repoRoot)` -- OID текущего HEAD commit.
5. `getHeadTree(repoRoot)` -- OID корневого tree текущего HEAD.
6. `getSubtreeOid(repoRoot, subpath)` -- OID поддерева (`git rev-parse HEAD:<subpath>`) для skip check subpath sources.
7. `isDirtyWorktree(repoRoot)` -- dirty state рабочей директории.
8. `getCommittedDiffPaths(repoRoot, fromOid, toOid, repoSubpath?)` -- список путей из committed diff.
9. `getTrackedWorktreeChanges(repoRoot, repoSubpath?)` -- tracked dirty файлы.
10. `getUntrackedFiles(repoRoot, repoSubpath?)` -- untracked файлы.
11. `isAncestor(repoRoot, maybeAncestor, maybeDescendant)` -- ancestor check для fast-forward vs rebase.

Также реализовать генерацию `snapshot_fingerprint` с тремя форматами:
- `tree:<head_tree_oid>` -- для clean git snapshot.
- `dirty:<head_commit_oid>:<sha256(full_snapshot_manifest)>` -- для dirty snapshot.
- `workspace:<sha256(full_snapshot_manifest)>` -- для non-git workspace.

Функция `computeSnapshotFingerprint(params)` принимает `viewKind`, `dirty`, `headCommitOid`, `headTreeOid`, snapshot manifest hash и возвращает строку в соответствующем формате. Экспортируется через `src/sources/index.ts`.

Scope-уточнение:
Текущий `git.ts` содержит `cloneOrPull()`, `extractRepoName()`, `expandHome()` для remote git-источников. Эти функции СОХРАНЯЮТСЯ. Новые 11 методов добавляются параллельно. `src/sources/index.ts` экспортирует и старые, и новые функции. Если файл становится слишком большим (>400 строк), допускается вынос remote-функций в `src/sources/git-remote.ts`.

Files:
`src/sources/git.ts`, `src/sources/fingerprint.ts` (new), `src/sources/index.ts`, `src/sources/__tests__/git.test.ts` (обновить — добавить тесты для новых 11 методов), `src/sources/__tests__/fingerprint.test.ts` (new).

Logging requirements:
Log DEBUG traces for each git command invocation and normalized output, INFO logs for resolved repo/view state, WARN for degraded/fallback git paths, and ERROR with repo path plus command name.

Dependency notes:
Depends on Task 1. This task unlocks runtime and indexer refactors (Tasks 4-5).

### Phase 2: Snapshot Indexing Pipeline

#### ~~Task 4: Refactor runtime to resolve logical source + active/current view instead of one-state sources~~ [x]
Deliverable:
Rewrite runtime assembly so local path indexing detects git-backed workspaces, upserts logical `source` (включая `repo_root_path`, `repo_subpath`), reconciles branch views, selects the current `source_view`, updates `active_view_id`, and passes branch-aware context into the indexer.

Remote git-источники:
Remote git-источники (`rag index --git <url>`) продолжают работать через `cloneOrPull`. После clone/pull runtime snapshot-ирует склонированную директорию как branch view (по `--branch` параметру) или workspace view. Логика переиспользует новый `source_view` pipeline, включая `file_blobs` и `chunk_contents`.

Критичные контракты:
- `sources.active_view_id` обновляется **только после успешного finalize** snapshot-а (embeddings записаны, `source_views` финализирован). Если индексация упала — `active_view_id` остаётся на предыдущем значении, чтобы `search`/`read_source` продолжали работать по последнему валидному snapshot-у.
- `deleteMissingBranchViews` применяется **только** к `view_kind = 'branch'`. `detached` views не подпадают под branch reconciliation — их retention policy отложена на следующую итерацию.

Обновление `createIndexerRuntime` DI:
Текущий factory создаёт `SourceStorage`, `ChunkStorage`, `IndexedFileStorage`, `TextEmbedder`, `ChunkDispatcher`. Новый factory дополнительно создаёт `SourceViewStorage`, `FileBlobStorage`, `ChunkContentStorage`. `IndexerRuntime` interface расширяется: добавить `sourceViewStorage`, `fileBlobStorage`, `chunkContentStorage`, `indexedFileStorage` (уже существует, но явно экспортируется). Новый `Indexer` constructor принимает расширенный набор storage-зависимостей. `indexSourceFromConfig` использует `sourceViewStorage` для reconciliation и view resolution.

Если source config содержит branch-specific параметры, убедиться что `src/config/schema.ts` и `src/config/defaults.ts` обновлены соответственно, а также `docs/configuration.md` и тесты конфигурации (per RULES.md: новые поля конфигурации обязательно синхронно в schema, defaults, docs, tests).

Files:
`src/indexer/runtime.ts`, `src/indexer/index.ts`, `src/commands/index-cmd.ts`, `src/storage/index.ts`, `src/config/schema.ts` (если добавляются config-поля), `src/config/defaults.ts` (если добавляются config-поля), `docs/configuration.md` (если добавляются config-поля), `src/indexer/__tests__/runtime.test.ts`.

Logging requirements:
Log INFO checkpoints for source resolution, view reconciliation, stale branch deletion, and active-view updates; DEBUG log the chosen runtime path (`workspace`, `branch`, `detached`, `dirty`, `skip`, `full-scan`, `diff-scan`); ERROR logs must include source name/path.

Dependency notes:
Depends on Tasks 2-3.

#### ~~Task 5: Rebuild indexer write path around views, file blobs, deduplicated chunk contents, and post-write embeddings~~ [x]
Deliverable:
Rework `Indexer` and incremental helpers so writes occur per `source_view_id`, file bodies land in `file_blobs`, chunk bodies land in `chunk_contents`, occurrences land in `chunks`, embeddings are filled after snapshot persistence, and dirty/non-ancestor paths fall back correctly.

Новый интерфейс Indexer:
Текущий `Indexer.indexSource(source: SourceRow, files: ScannedFile[])` принимает файлы в памяти. Новый сигнатур: `indexView(sourceView: SourceViewRow, changedFiles: ChangedFile[], deletedPaths: string[]): Promise<IndexResult>`, где `ChangedFile` содержит `{ path: string; content: string; contentHash: string }`. Runtime (Task 4) отвечает за определение changed/deleted файлов и передачу их в Indexer. Indexer отвечает за chunking, blob storage, content dedup, embedding и finalize.

Полная переработка `incremental.ts`:
Текущая функция `detectChanges(sourceId, files, storage)` с SHA-256 сравнением in-memory файлов удаляется. Новый сигнатур: `detectViewChanges(params: ViewChangeDetectionParams): Promise<ViewChangeResult>`, где `ViewChangeDetectionParams` содержит `sourceView: SourceViewRow`, `previousViewState?: { headCommitOid, headTreeOid, subtreeOid, dirty }`, `gitContext?: GitSnapshotContext` (из Task 3), `scannedFiles: ScannedFile[]`. `ViewChangeResult` возвращает `{ changedFiles: ChangedFile[], deletedPaths: string[], strategy: 'full-scan' | 'diff-scan' | 'skip' }`.

Матрица определения изменённых файлов (per RESEARCH.md Section 5):
1. **Новый view** (previousViewState отсутствует) → full scan, strategy: 'full-scan'.
2. **Clean git view, skip check**: `subtree_oid` (если `repo_subpath`) или `head_tree_oid` совпадает с saved → strategy: 'skip'.
3. **Clean git view, ancestor relationship**: committed diff (`git diff --name-only <saved> <current>`) + если dirty → tracked worktree changes + untracked files. Если saved view тоже был dirty → fallback на full scan. Strategy: 'diff-scan' или 'full-scan'.
4. **Rebase/reset/non-ancestor** → fallback на full scan, strategy: 'full-scan'.
5. **Workspace / non-git** → full scan + compare hashes against `indexed_files`, strategy: 'full-scan'.

Write order: `insert/update new → replace occurrences → delete removed`. Нельзя держать длинную транзакцию на сетевых вызовах embedding provider.

Finalize после записи snapshot-а и embeddings:
- `source_views`: обновить `head_commit_oid`, `head_tree_oid`, `subtree_oid`, `dirty`, `snapshot_fingerprint`, `file_count`, `chunk_count`, `last_indexed_at`.
- `sources`: обновить `last_indexed_at`.
- `sources.active_view_id`: обновить только после успешного finalize (контракт из Task 4).

Если embedding provider упал — snapshot остаётся валидным для BM25/`read_source`; `rag re-embed` работает как recovery path.

Обновление `IndexResult` и `ProgressReporter`:
`IndexResult` расширяется полями: `reusedBlobCount: number`, `reusedChunkContentCount: number`, `newBlobCount: number`, `newChunkContentCount: number`, `embeddingsDeferred: number`, `strategy: string` (из матрицы). `ProgressReporter` получает новые callbacks: `onBlobDedup(reused: number, total: number)`, `onContentDedup(reused: number, total: number)`. `ConsoleProgress` обновляется с новыми строками отчёта для dedup-статистики.

Конкретные изменения для `re-embed`:
- `rag re-embed` теперь оперирует на `chunk_contents.embedding` вместо individual chunk rows.
- `getWithNullEmbedding` из `ChunkContentStorage` возвращает `chunk_contents` без embedding.
- `updateEmbeddings` обновляет `chunk_contents.embedding` по `content_hash`.
- Обновить `src/commands/re-embed-cmd.ts` для работы через `ChunkContentStorage` API.

Files:
`src/indexer/indexer.ts`, `src/indexer/incremental.ts`, `src/indexer/progress.ts`, `src/commands/re-embed-cmd.ts`, `src/storage/chunk-contents.ts`, `src/storage/chunks.ts`, `src/storage/indexed-files.ts`, `src/indexer/__tests__/indexer.test.ts`, `src/indexer/__tests__/incremental.test.ts`.

Logging requirements:
Log DEBUG counts for changed/deleted files, reused vs new blobs/content rows, deferred embedding batches, and fallback reasons; INFO for snapshot completion and counts; ERROR with `sourceId`, `viewId`, and file path on failures.

Dependency notes:
Depends on Tasks 2-4.

### Phase 3: Query Strategy and Read Surfaces

#### ~~Task 6: Add benchmark harness and fixtures for BM25 shape and narrow/exact vector thresholds~~ [x]
Deliverable:
Introduce a reproducible benchmark artifact that can run against seeded branch-aware data and compare:
1. BM25 shape A (`GIN -> expand -> filter`) vs shape B (`filter -> join -> GIN check`)
2. Narrow exact vector search vs broad ANN overfetch across different candidate set sizes

The benchmark must emit enough measurements to choose:
- the default BM25 query shape per planner profile
- the initial threshold for switching from narrow exact mode to broad mode
- overfetch escalation defaults

Files:
`scripts/bench/branch-aware-search.ts` (new), `package.json` (if a benchmark script is added), `src/search/__tests__/fixtures/branch-aware-search.ts` (new fixture or seed helper), `docs/development.md` or `docs/architecture.md` (benchmark execution notes).

Logging requirements:
Benchmark output must log scenario name, row counts, filter selectivity, execution time, chosen path, and environment assumptions; use INFO for summary rows and DEBUG for per-query internals.

Dependency notes:
Depends on Tasks 2-5. This task must finish before query strategy constants are frozen in the implementation.

#### ~~Task 7: Implement branch-aware BM25/vector search and coordinator result shaping~~ [x]
Deliverable:
Добавить search-specific types и search methods в storage, обновить `SearchCoordinator` для branch-aware поиска:

1. Добавить `SearchFilters` и `ScoredChunkOccurrence` в `src/search/types.ts`.
2. Добавить методы `searchBm25`, `searchVector`, `getContentHashes` в `ChunkContentStorage` и `ChunkStorage`.
3. Обновить `SearchCoordinator` так, чтобы default search resolves `active_view_id`, optional `branch` narrows results, BM25 и vector retrieval возвращают occurrence-level `chunkId`, coordinator возвращает `viewKind` / `refName` metadata со stable scoring semantics.

Vector search strategy (per RESEARCH.md Section 6):
- **Narrow mode** (один source / конкретная branch / `pathPrefix`): собрать множество `chunk_content_hash` из `chunks` через `getContentHashes(filters)` с полным набором occurrence-level `SearchFilters` (`sourceViewIds`, `sourceType`, `pathPrefix`); если < 10K — exact vector search по prefiltered set; иначе — broad mode.
- **Broad mode**: ANN overfetch по `chunk_contents` с adaptive factor (начальный 3×topK) → expand в `chunks` → filter по occurrence-level filters → content-level dedup → если результатов < topK — escalation (6×, 10×) → если всё ещё мало — exact fallback.
- **Content-level dedup до RRF**: одна occurrence на уникальный `chunk_content_hash` в рамках одной view после hard filters. Tie-break детерминированный: `path` ASC, затем `ordinal` ASC.
- `pathPrefix` и `sourceType` — hard filters в обоих режимах, не post-processing.

Порядок реализации внутри задачи:
1. Добавить `SearchFilters`, `ScoredChunkOccurrence` в `src/search/types.ts`.
2. Добавить `searchBm25`, `searchVector` в `ChunkContentStorage` (заменяют stub-ы из Task 2).
3. Добавить `getContentHashes` в `ChunkStorage`.
4. Обновить `src/search/hybrid.ts` — content-level dedup по `chunk_content_hash` перед RRF. Tie-break: `path` ASC, затем `ordinal` ASC. `rrfFuse` принимает occurrence-level id'ы, но работает на deduplicated set.
5. Обновить `SearchCoordinator` — resolve `active_view_id`, narrow/broad modes, dedup, новые зависимости.
6. Обновить `src/mcp/tools/search.ts` — optional `branch` параметр.

Files:
`src/search/types.ts`, `src/search/coordinator.ts`, `src/search/hybrid.ts`, `src/search/index.ts`, `src/storage/chunk-contents.ts` (добавить searchBm25, searchVector), `src/storage/chunks.ts` (добавить getContentHashes), `src/mcp/tools/search.ts`, `src/search/__tests__/coordinator.test.ts`, `src/search/__tests__/hybrid.test.ts` (обновить — добавить тесты content-level dedup).

Logging requirements:
Log DEBUG for chosen retrieval mode (`bm25-shape-a`, `bm25-shape-b`, `vector-narrow`, `vector-broad`, `vector-fallback`), candidate counts before/after dedup/filter, and resolved view filters; INFO for final search summary; ERROR with query and filter context.

Dependency notes:
Depends on Tasks 2-6.

#### ~~Task 8: Rework snapshot-based read and source/view listing across CLI and MCP surfaces~~ [x]
Deliverable:
Replace disk-based `read_source` resolution with blob-backed snapshot reads, add optional `branch` handling, expose source/view metadata in MCP and CLI surfaces, and update status/list/remove semantics to respect logical source vs view-level state.

Обновление `src/mcp/server.ts` (DI-граф):
Текущий `server.ts` создаёт `ChunkStorage` и `SourceStorage`. После refactor нужно инстанцировать: `SourceStorage`, `SourceViewStorage`, `FileBlobStorage`, `ChunkContentStorage`, `ChunkStorage`. Передать `FileBlobStorage` в `registerReadSourceTool`, `SourceViewStorage` в `registerListSourcesTool` и `registerSearchTool`, обновить `SearchCoordinator` constructor.

Изменения `read_source` по resolution paths:
1. **By chunkId** — текущий код читает с файловой системы через `readFile(join(source.path, metadata.path))`. Новый код: загружает `indexed_file` по `chunk.indexed_file_id` → `file_blobs.content` по `indexed_file.content_hash`. Fallback на FS только если blob не найден (graceful degradation).
2. **By headerPath** — аналогично: blob-backed + fallback.
3. **By coordinates (sourceName+path)** — загрузка через `IndexedFileStorage.getByPath(activeViewId, path)` → `file_blobs.content`. Optional `branch` параметр для чтения неактивной ветки.

Обновление `SystemStatusSnapshot`:
Добавить поля: `viewCount`, `fileBlobCount`, `fileBlobSizeBytes`, `chunkContentCount`, `chunkContentWithEmbeddingCount`. Эти метрики нужны для мониторинга blob growth (known limitation из RESEARCH.md).

Files:
`src/mcp/tools/read-source.ts`, `src/mcp/tools/list-sources.ts`, `src/mcp/tools/status.ts`, `src/status/service.ts`, `src/status/types.ts` (обновить `SystemStatusSnapshot` для view counts и blob stats), `src/commands/list-cmd.ts`, `src/commands/status-cmd.ts`, `src/commands/remove-cmd.ts`, `src/mcp/server.ts` (обновить DI-граф для новых storage-зависимостей), `src/mcp/tools/__tests__/status.test.ts`, plus new tests for `read_source` and `list_sources`.

Logging requirements:
Log INFO for resolved read mode (`chunkId`, `source+path`, `source+branch+path`, `headerPath`), active/default view resolution, and view summary generation; DEBUG for blob/file lookup chain; ERROR with lookup keys and missing-entity context.

Dependency notes:
Depends on Tasks 2, 4, and 5. `read_source` использует `file_blobs` (Task 5) и `ChunkStorage.getByIds` (Task 2) — не требует search types из Task 7. Обновление `list-sources` metadata (viewKind, refName) и `search` tool (branch параметр) требуют типов из Task 7, но эти части Task 8 могут быть реализованы после Task 7.

### Phase 4: Lifecycle, Portability, and Verification

#### ~~Task 9: Add garbage collection command and orphan cleanup plumbing~~ [x]
Deliverable:
Implement `rag gc` plus storage cleanup methods that remove orphan `file_blobs` and `chunk_contents` after a grace period, and make status surfaces report enough data to observe blob/content growth.

Files:
`src/commands/gc-cmd.ts` (new), `src/cli.ts`, `src/storage/file-blobs.ts`, `src/storage/chunk-contents.ts`, `src/status/service.ts`, tests for GC command/storage behavior.

Logging requirements:
Log INFO for grace period, deleted row counts, and dry-run style summaries if supported; DEBUG for orphan candidate counts before deletion; WARN when cleanup is skipped due to recent references; ERROR with failing table/operation.

Dependency notes:
Depends on Tasks 2 and 5.

#### ~~Task 10: Upgrade export/import to schema v2 with snapshot completeness~~ [x]
Deliverable:
Move export/import from source+chunks dumps to schema-v2 archives that include `sources`, `source_views`, `file_blobs`, `indexed_files`, `chunk_contents`, and `chunks`, reject incompatible manifest v1 imports explicitly, and preserve snapshot-based `read_source` semantics after import.

Формат v2:
Формат остаётся SQL-based (как v1) для совместимости с `psql` pipe. `chunk_contents.search_vector` — generated column, пропускается при export/import. `chunk_contents.embedding` экспортируется как `::vector(N)` cast. Keyset pagination обновляется для 6 таблиц. INSERT order: parents before children (`sources` → `source_views` → `file_blobs` → `indexed_files` → `chunk_contents` → `chunks`). Manifest v2: `version: 2`, `schemaVersion` = текущий migration count. Import v1 manifests: reject с информативным сообщением о несовместимости и рекомендацией переиндексации.

Files:
`src/export/exporter.ts`, `src/export/importer.ts`, `src/export/manifest.ts`, `src/export/index.ts`, `src/export/__tests__/exporter.test.ts`, `src/export/__tests__/importer.test.ts`, `src/export/__tests__/integration.test.ts`.

Logging requirements:
Log INFO per exported/imported logical source and per-view counts, DEBUG for manifest/schema compatibility decisions and batch progress, WARN for skipped/incompatible artifacts, and ERROR with archive/source identifiers.

Dependency notes:
Depends on Tasks 1-5 and Task 8. Coordinate manifest/version changes with migration assumptions.

#### ~~Task 11: Add regression tests, benchmark acceptance criteria, and documentation checkpoint~~ [x]
Deliverable:
Finalize the delivery with regression tests for branch lifecycle (`branch1 -> branch2 -> modify -> delete -> gc`), vector dedup behavior, snapshot reads, export/import v2, and documented benchmark conclusions including selected BM25 shape and vector threshold. Update public docs for changed CLI/MCP behavior and architecture.

Files:
`src/indexer/__tests__/runtime.test.ts`, `src/indexer/__tests__/indexer.test.ts`, `src/search/__tests__/coordinator.test.ts`, new MCP/read-source tests, `src/export/__tests__/integration.test.ts`, `docs/architecture.md`, `docs/cli.md`, `docs/mcp-integration.md`, `docs/development.md`, `README.md` (if top-level behavior summary changes).

Logging requirements:
Document expected logging behavior in tests where public/error surfaces changed; ensure benchmark write-up records dataset assumptions, measured thresholds, and selected defaults; log WARN in docs if benchmark results are environment-sensitive.

Dependency notes:
Depends on Tasks 6-10. This is the required docs checkpoint because public CLI/MCP and storage behavior change together.

## Execution Notes
- **Компиляционная целостность:** Между Tasks 2-6 search pipeline использует stub-методы в `ChunkStorage`. Каждый commit должен проходить `npm run typesCheck` и `npm test`. Stub-ы — легитимный промежуточный шаг, но они должны бросать информативные ошибки, а не молча возвращать пустые результаты.
- **Remote git-источники** не теряются: `cloneOrPull`/`extractRepoName` сохраняются в `src/sources/git.ts` (или `git-remote.ts`). Runtime (Task 4) интегрирует remote path через новый `source_view` pipeline.
- **DI-граф MCP сервера** (`src/mcp/server.ts`) обновляется в Task 8: новые storage-классы инстанцируются и передаются в tool-регистраторы.
- **`hybrid.ts`** обновляется в Task 7: content-level dedup перед RRF fusion.
- **Директория `src/storage/__tests__/`** создаётся в Task 1 — ранее тестов для storage модуля не было.
- Preserve modular boundaries from `ARCHITECTURE.md`: `commands/` and `mcp/` remain thin adapters, business logic lives in `indexer/`, `search/`, `sources/`, and `storage/`.
- Use barrel exports only; do not introduce direct imports into internal files of foreign modules.
- Expect the biggest integration risk at the seam between snapshot-aware indexing and occurrence-level search/read APIs; verify that `chunkId` stays occurrence-level end to end.
- Treat benchmark results as implementation inputs, not documentation garnish: the chosen BM25 shape and vector threshold must be encoded explicitly in code/tests/docs once measured.
- Per RULES.md: любое новое поле конфигурации обязано быть добавлено одновременно в `src/config/schema.ts`, `src/config/defaults.ts`, `docs/configuration.md` и тесты конфигурации. Task 4 является точкой, где config schema изменения наиболее вероятны.
- `snapshot_fingerprint` генерируется в `src/sources/fingerprint.ts` (Task 3) и используется runtime-ом (Task 4) и indexer-ом (Task 5) при finalize snapshot.
- `re-embed` после этой фичи работает исключительно через `ChunkContentStorage.getWithNullEmbedding` / `updateEmbeddings`, а не через individual chunk rows.
- **После destructive cutover (миграция 005) требуется полная переиндексация всех источников** (`rag index --all`). Миграция удаляет все данные, обратная совместимость не предусмотрена (per RESEARCH.md Section 7, шаг 12).
- Commit plan разделён на 6 коммитов: Commit 2a (Tasks 4-5, indexing pipeline), Commit 2b (Tasks 6-7, search/benchmark), Commit 3a (Tasks 8-9, read surfaces + GC), Commit 3b (Task 10, export/import v2), Commit 3c (Task 11, regression + docs) для управляемого размера review.
- Search types (`SearchFilters`, `ScoredChunkOccurrence`) определяются в `src/search/types.ts` в Task 7, а не в storage-задаче Task 2, чтобы не нарушать модульные границы.
