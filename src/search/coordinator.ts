// Координатор поиска — оркестрирует BM25 + vector + RRF + rerank pipeline.
import type { SearchConfig } from '../config/schema.js';
import type { TextEmbedder } from '../embeddings/types.js';
import type { ChunkStorage } from '../storage/chunks.js';
import type { SourceStorage } from '../storage/sources.js';
import { rrfFuse } from './hybrid.js';
import type { Reranker } from './reranker/types.js';
import type { SearchQuery, SearchResponse, SearchResult } from './types.js';

// Максимальная длина snippet в символах.
const SNIPPET_MAX_LENGTH = 500;

// Оркестратор hybrid search pipeline.
export class SearchCoordinator {
  constructor(
    private chunkStorage: ChunkStorage,
    private sourceStorage: SourceStorage,
    private embedder: TextEmbedder,
    private searchConfig: SearchConfig,
    private reranker: Reranker,
  ) {}

  // Выполняет hybrid search: embed -> parallel BM25 + vector -> RRF -> rerank -> результаты.
  async search(query: SearchQuery): Promise<SearchResponse> {
    // 1. Генерируем эмбеддинг запроса.
    const queryEmbedding = await this.embedder.embedQuery(query.query);

    // 2. Параллельно запускаем BM25 и vector search.
    const [bm25Results, vectorResults] = await Promise.all([
      this.chunkStorage.searchBm25(
        query.query,
        this.searchConfig.retrieveTopK,
        query.sourceId,
      ),
      this.chunkStorage.searchVector(
        queryEmbedding,
        this.searchConfig.retrieveTopK,
        query.sourceId,
      ),
    ]);

    // 3. Объединяем результаты через RRF.
    const fused = rrfFuse(
      bm25Results,
      vectorResults,
      this.searchConfig.rrf.k,
      this.searchConfig.bm25Weight,
      this.searchConfig.vectorWeight,
    );

    // 4. Берём retrieveTopK кандидатов для реранкера.
    const candidates = fused.slice(0, this.searchConfig.retrieveTopK);

    // 5. Загружаем полные данные чанков (один раз для реранкера и финального ответа).
    const chunkIds = candidates.map((r) => r.id);
    const chunks = await this.chunkStorage.getByIds(chunkIds);

    // 6. Загружаем источники для маппинга имён.
    const sources = await this.sourceStorage.getAll();
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    // 7. Строим карты оценок для BM25, vector и RRF.
    const bm25ScoreMap = new Map(bm25Results.map((r) => [r.id, r.score]));
    const vectorScoreMap = new Map(vectorResults.map((r) => [r.id, r.score]));
    const rrfScoreMap = new Map(candidates.map((r) => [r.id, r.score]));

    // 8. Переранжируем кандидатов.
    const topK = query.topK ?? this.searchConfig.finalTopK;
    const rerankDocs = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
    }));
    const rerankResults = await this.reranker.rerank(query.query, rerankDocs, topK);
    const rerankScoreMap = new Map(rerankResults.map((r) => [r.id, r.score]));

    // 9. Собираем итоговые результаты в порядке реранкера.
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: SearchResult[] = [];

    for (const rerankResult of rerankResults) {
      const chunk = chunkMap.get(rerankResult.id);
      if (!chunk) {
        continue;
      }

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
          rrf: rrfScoreMap.get(chunk.id) ?? 0,
          rerank: rerankScoreMap.get(chunk.id) ?? null,
        },
      });
    }

    return {
      results,
      totalCandidates: fused.length,
    };
  }
}
