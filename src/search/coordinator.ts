// Координатор поиска — оркестрирует BM25 + vector + RRF pipeline.
import type { SearchConfig } from '../config/schema.js';
import type { TextEmbedder } from '../embeddings/types.js';
import type { ChunkStorage } from '../storage/chunks.js';
import type { SourceStorage } from '../storage/sources.js';
import { rrfFuse } from './hybrid.js';
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
  ) {}

  // Выполняет hybrid search: embed -> parallel BM25 + vector -> RRF -> результаты.
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

    // 4. Берём top K результатов.
    const topK = query.topK ?? this.searchConfig.finalTopK;
    const topResults = fused.slice(0, topK);

    // 5. Загружаем полные данные чанков.
    const chunkIds = topResults.map((r) => r.id);
    const chunks = await this.chunkStorage.getByIds(chunkIds);

    // 6. Загружаем источники для маппинга имён.
    const sources = await this.sourceStorage.getAll();
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    // 7. Строим карты оценок для BM25, vector и RRF.
    const bm25ScoreMap = new Map(bm25Results.map((r) => [r.id, r.score]));
    const vectorScoreMap = new Map(vectorResults.map((r) => [r.id, r.score]));
    const rrfScoreMap = new Map(topResults.map((r) => [r.id, r.score]));

    // 8. Собираем итоговые результаты.
    const results: SearchResult[] = chunks.map((chunk) => {
      const metadata = chunk.metadata as Record<string, unknown>;
      const source = sourceMap.get(chunk.source_id);

      return {
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
          rerank: null, // Rerank будет добавлен в Фазе 2.
        },
      };
    });

    return {
      results,
      totalCandidates: fused.length,
    };
  }
}
