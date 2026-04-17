// Координатор branch-aware поиска.
import type { SearchConfig } from '../config/index.js';
import type { TextEmbedder } from '../embeddings/index.js';
import type {
  ChunkStorage,
  ChunkContentStorage,
  SourceRow,
  SourceStorage,
  SourceViewStorage,
} from '../storage/index.js';
import { rrfFuse } from './hybrid.js';
import type { Reranker } from './reranker/types.js';
import type {
  SearchQuery,
  SearchResponse,
  SearchResult,
  ScoredChunk,
  SearchFilters,
} from './types.js';

// Максимальная длина snippet в символах.
const SNIPPET_MAX_LENGTH = 500;

// Порог narrow/broad mode: если content hashes < NARROW_THRESHOLD → exact search.
const NARROW_THRESHOLD = 10_000;

// TTL кэша sources (мс).
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;

// Оркестратор branch-aware hybrid search pipeline.
export class SearchCoordinator {
  private sourceCache: Map<string, SourceRow> | null = null;
  private sourceCacheUpdatedAt = 0;

  constructor(
    private chunkStorage: ChunkStorage,
    private sourceStorage: SourceStorage,
    private embedder: TextEmbedder,
    private searchConfig: SearchConfig,
    private reranker: Reranker,
    // Branch-aware завис��мости (Task 7).
    private chunkContentStorage?: ChunkContentStorage,
    private sourceViewStorage?: SourceViewStorage,
  ) {}

  /**
   * Branch-aware hybrid search pipeline:
   * 1. Resolve view filters (active views / specific branch).
   * 2. Determine narrow/broad mode.
   * 3. Parallel BM25 + vector на content level.
   * 4. Expand → occurrence-level dedup.
   * 5. RRF fusion.
   * 6. Rerank → final results.
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    // Branch-aware path (если storage доступен).
    if (this.chunkContentStorage && this.sourceViewStorage) {
      return this.searchBranchAware(query);
    }

    // Legacy fallback (для обратной совместимости).
    return this.searchLegacy(query);
  }

  // --- Branch-aware search. ---

  private async searchBranchAware(query: SearchQuery): Promise<SearchResponse> {
    // 1. Resolve view filters.
    const filters = await this.resolveSearchFilters(query);
    console.error(
      `[search] branch-aware: views=${filters.sourceViewIds.length}, ` +
      `sourceType=${filters.sourceType ?? 'all'}, pathPrefix=${filters.pathPrefix ?? 'none'}`,
    );

    if (filters.sourceViewIds.length === 0) {
      return { results: [], totalCandidates: 0, retrievalMode: 'empty' };
    }

    // 2. Determine mode: get content hashes for narrow/broad decision.
    const contentHashes = await this.chunkStorage.getContentHashes(filters);
    const isNarrow = contentHashes.length < NARROW_THRESHOLD;
    const mode = isNarrow ? 'narrow' : 'broad';

    console.error(`[search] mode=${mode}, contentHashes=${contentHashes.length}`);

    // 3. Embed query.
    const queryEmbedding = await this.embedder.embedQuery(query.query);

    // 4. Parallel BM25 + vector (+ optional summary vector).
    const topK = this.searchConfig.retrieveTopK;
    const hashesForSearch = isNarrow ? contentHashes : undefined;

    // Решение про 3-way: флаг + наличие хотя бы одного non-NULL summary_embedding в views.
    const wantSummary = this.searchConfig.useSummaryVector === true;
    const hasSummary = wantSummary
      ? await this.chunkContentStorage!.hasSummaryForViews(filters.sourceViewIds)
      : false;
    const run3Way = wantSummary && hasSummary;

    console.error(
      `[search] 3-way: wantSummary=${wantSummary}, hasSummary=${hasSummary}, run3Way=${run3Way}`,
    );

    const bm25Promise = this.chunkContentStorage!
      .searchBm25(query.query, topK, hashesForSearch);
    const vectorPromise = this.chunkContentStorage!
      .searchVector(queryEmbedding, topK, hashesForSearch);
    const summaryPromise = run3Way
      ? this.chunkContentStorage!.searchSummaryVector(queryEmbedding, topK, hashesForSearch)
      : Promise.resolve<Array<{ contentHash: string; score: number }>>([]);

    const [bm25Results, vectorResults, summaryResults] = await Promise.all([
      bm25Promise,
      vectorPromise,
      summaryPromise,
    ]);

    // 5. Collect all scored content hashes.
    const allContentHashes = new Set([
      ...bm25Results.map((r) => r.contentHash),
      ...vectorResults.map((r) => r.contentHash),
      ...summaryResults.map((r) => r.contentHash),
    ]);

    if (allContentHashes.size === 0) {
      const retrievalMode = run3Way ? `${mode}+summary` : mode;
      return { results: [], totalCandidates: 0, retrievalMode };
    }

    // 6. Resolve → occurrence-level (dedup: one per content_hash per view).
    const occurrences = await this.chunkStorage.resolveOccurrences(
      [...allContentHashes],
      filters.sourceViewIds,
      filters.sourceType,
      filters.pathPrefix,
    );

    // Map contentHash → occurrence.
    const hashToOccurrence = new Map(occurrences.map((o) => [o.chunk_content_hash, o]));

    // 7. Convert content scores → occurrence-level ScoredChunk.
    const bm25ScoreMap = new Map(bm25Results.map((r) => [r.contentHash, r.score]));
    const vectorScoreMap = new Map(vectorResults.map((r) => [r.contentHash, r.score]));
    const summaryScoreMap = new Map(summaryResults.map((r) => [r.contentHash, r.score]));

    const bm25Occurrences: ScoredChunk[] = [];
    const vectorOccurrences: ScoredChunk[] = [];
    const summaryOccurrences: ScoredChunk[] = [];

    for (const [contentHash, occ] of hashToOccurrence) {
      const bm25Score = bm25ScoreMap.get(contentHash);
      if (bm25Score !== undefined) {
        bm25Occurrences.push({ id: occ.id, score: bm25Score });
      }
      const vectorScore = vectorScoreMap.get(contentHash);
      if (vectorScore !== undefined) {
        vectorOccurrences.push({ id: occ.id, score: vectorScore });
      }
      const summaryScore = summaryScoreMap.get(contentHash);
      if (summaryScore !== undefined) {
        summaryOccurrences.push({ id: occ.id, score: summaryScore });
      }
    }

    // Сортируем по score desc для правильного RRF ranking.
    bm25Occurrences.sort((a, b) => b.score - a.score);
    vectorOccurrences.sort((a, b) => b.score - a.score);
    summaryOccurrences.sort((a, b) => b.score - a.score);

    // 8. RRF fusion (3-way при run3Way, иначе 2-way).
    const fused = rrfFuse(
      bm25Occurrences,
      vectorOccurrences,
      this.searchConfig.rrf.k,
      this.searchConfig.bm25Weight,
      this.searchConfig.vectorWeight,
      summaryOccurrences,
      run3Way ? this.searchConfig.summaryVectorWeight : 0,
    );

    const candidates = fused.slice(0, this.searchConfig.retrieveTopK);

    // 9. Load chunks + rerank.
    const chunkIds = candidates.map((r) => r.id);
    const chunks = await this.chunkStorage.getByIds(chunkIds);
    const sourceMap = await this.getSourceMap();

    const rrfScoreMap = new Map(candidates.map((r) => [r.id, r.score]));

    const finalTopK = query.topK ?? this.searchConfig.finalTopK;
    const rerankDocs = chunks.map((chunk) => ({ id: chunk.id, content: chunk.content }));
    const rerankResults = await this.reranker.rerank(query.query, rerankDocs, finalTopK);
    const rerankScoreMap = new Map(rerankResults.map((r) => [r.id, r.score]));

    // 10. Build results.
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: SearchResult[] = [];

    for (const rerankResult of rerankResults) {
      const chunk = chunkMap.get(rerankResult.id);
      if (!chunk) continue;

      const source = sourceMap.get(chunk.source_id);

      results.push({
        chunkId: chunk.id,
        path: chunk.path,
        sourceType: chunk.source_type,
        sourceName: source?.name ?? 'unknown',
        snippet: chunk.content.slice(0, SNIPPET_MAX_LENGTH),
        coordinates: {
          startLine: chunk.start_line ?? undefined,
          endLine: chunk.end_line ?? undefined,
          headerPath: chunk.header_path ?? undefined,
          fqn: (chunk.metadata as Record<string, unknown>).fqn as string | undefined,
          fragmentType: (chunk.metadata as Record<string, unknown>).fragmentType as string | undefined,
        },
        scores: {
          bm25: bm25ScoreMap.get(chunk.chunk_content_hash) ?? null,
          vector: vectorScoreMap.get(chunk.chunk_content_hash) ?? null,
          summaryVector: run3Way
            ? summaryScoreMap.get(chunk.chunk_content_hash) ?? null
            : null,
          rrf: rrfScoreMap.get(chunk.id) ?? 0,
          rerank: rerankScoreMap.get(chunk.id) ?? null,
        },
      });
    }

    const retrievalMode = run3Way ? `${mode}+summary` : mode;
    return {
      results,
      totalCandidates: fused.length,
      retrievalMode,
    };
  }

  /**
   * Resolves search filters: source_view_ids from active views or specific branch.
   * Резолвит sourceName → sourceId до остальной фильтрации; бросает ошибку
   * при конфликте параметров или неизвестном имени источника.
   */
  private async resolveSearchFilters(query: SearchQuery): Promise<SearchFilters> {
    const effectiveQuery = await this.resolveSourceNameFilter(query);
    const viewIds: string[] = [];

    if (effectiveQuery.branch) {
      // Ищем view по branch name.
      const sources = await this.sourceStorage.getAll();
      for (const source of sources) {
        if (effectiveQuery.sourceId && source.id !== effectiveQuery.sourceId) continue;

        const view = await this.sourceViewStorage!.getRefView(source.id, 'branch', effectiveQuery.branch);
        if (view) {
          viewIds.push(view.id);
        }
      }

      console.error(
        `[search] resolved branch="${effectiveQuery.branch}" ` +
        `sourceId=${effectiveQuery.sourceId ?? 'any'}: ${viewIds.length} views`,
      );
    } else {
      // Default: active views.
      const sources = await this.sourceStorage.getAll();
      for (const source of sources) {
        if (effectiveQuery.sourceId && source.id !== effectiveQuery.sourceId) continue;

        if (source.active_view_id) {
          viewIds.push(source.active_view_id);
        }
      }

      console.error(
        `[search] resolved active views: ${viewIds.length} ` +
        `(sourceId=${effectiveQuery.sourceId ?? 'any'})`,
      );
    }

    return {
      sourceViewIds: viewIds,
      sourceType: effectiveQuery.sourceType,
      pathPrefix: effectiveQuery.pathPrefix,
    };
  }

  // Резолвит sourceName в sourceId. Проверяет конфликт sourceId+sourceName.
  // После резолва sourceName вычищается из результата, чтобы вниз по pipeline
  // шёл единообразный фильтр по sourceId.
  private async resolveSourceNameFilter(query: SearchQuery): Promise<SearchQuery> {
    if (!query.sourceName) return query;

    if (query.sourceId) {
      throw new Error('Provide either sourceId or sourceName, not both');
    }

    const source = await this.sourceStorage.getByName(query.sourceName);
    if (!source) {
      throw new Error(`Source "${query.sourceName}" not found`);
    }

    const resolved: SearchQuery = { ...query, sourceId: source.id };
    delete resolved.sourceName;
    return resolved;
  }

  // --- Legacy search (backward-compatible). ---

  private async searchLegacy(query: SearchQuery): Promise<SearchResponse> {
    const queryEmbedding = await this.embedder.embedQuery(query.query);

    const [bm25Results, vectorResults] = await Promise.all([
      this.chunkStorage.searchBm25(
        query.query,
        this.searchConfig.retrieveTopK,
        query.sourceId,
        query.sourceType,
        query.pathPrefix,
      ),
      this.chunkStorage.searchVector(
        queryEmbedding,
        this.searchConfig.retrieveTopK,
        query.sourceId,
        query.sourceType,
        query.pathPrefix,
      ),
    ]);

    const fused = rrfFuse(
      bm25Results,
      vectorResults,
      this.searchConfig.rrf.k,
      this.searchConfig.bm25Weight,
      this.searchConfig.vectorWeight,
    );

    const candidates = fused.slice(0, this.searchConfig.retrieveTopK);
    const chunkIds = candidates.map((r) => r.id);
    const chunks = await this.chunkStorage.getByIds(chunkIds);
    const sourceMap = await this.getSourceMap();

    const bm25ScoreMap = new Map(bm25Results.map((r) => [r.id, r.score]));
    const vectorScoreMap = new Map(vectorResults.map((r) => [r.id, r.score]));
    const rrfScoreMap = new Map(candidates.map((r) => [r.id, r.score]));

    const topK = query.topK ?? this.searchConfig.finalTopK;
    const rerankDocs = chunks.map((chunk) => ({ id: chunk.id, content: chunk.content }));
    const rerankResults = await this.reranker.rerank(query.query, rerankDocs, topK);
    const rerankScoreMap = new Map(rerankResults.map((r) => [r.id, r.score]));

    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: SearchResult[] = [];

    for (const rerankResult of rerankResults) {
      const chunk = chunkMap.get(rerankResult.id);
      if (!chunk) continue;

      const metadata = chunk.metadata as Record<string, unknown>;
      const source = sourceMap.get(chunk.source_id);

      results.push({
        chunkId: chunk.id,
        path: (metadata.path as string) ?? '',
        sourceType: (metadata.sourceType as string) ?? 'text',
        sourceName: source?.name ?? 'unknown',
        snippet: chunk.content.slice(0, SNIPPET_MAX_LENGTH),
        coordinates: {
          startLine: metadata.startLine as number | undefined,
          endLine: metadata.endLine as number | undefined,
          fqn: metadata.fqn as string | undefined,
          fragmentType: metadata.fragmentType as string | undefined,
          headerPath: metadata.headerPath as string | undefined,
          pageStart: metadata.pageStart as number | undefined,
          pageEnd: metadata.pageEnd as number | undefined,
        },
        scores: {
          bm25: bm25ScoreMap.get(chunk.id) ?? null,
          vector: vectorScoreMap.get(chunk.id) ?? null,
          summaryVector: null,
          rrf: rrfScoreMap.get(chunk.id) ?? 0,
          rerank: rerankScoreMap.get(chunk.id) ?? null,
        },
      });
    }

    return { results, totalCandidates: fused.length };
  }

  // Возвращает кэшированную Map sources с TTL.
  private async getSourceMap(): Promise<Map<string, SourceRow>> {
    const now = Date.now();
    if (this.sourceCache && now - this.sourceCacheUpdatedAt < SOURCE_CACHE_TTL_MS) {
      return this.sourceCache;
    }

    const sources = await this.sourceStorage.getAll();
    this.sourceCache = new Map(sources.map((s) => [s.id, s]));
    this.sourceCacheUpdatedAt = now;
    return this.sourceCache;
  }
}
