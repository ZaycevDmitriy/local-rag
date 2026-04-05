// Типы модуля поиска.

// Запрос на поиск.
export interface SearchQuery {
  query: string;
  topK?: number;
  sourceId?: string;
  sourceType?: string;
  pathPrefix?: string;
  // Branch-aware (Task 7).
  branch?: string;
}

// Фильтры для branch-aware search (occurrence-level).
export interface SearchFilters {
  sourceViewIds: string[];
  sourceType?: string;
  pathPrefix?: string;
}

// Фрагмент с оценкой (промежуточный результат).
export interface ScoredChunk {
  id: string;
  score: number;
}

// Результат content-level search (BM25/vector).
export interface ScoredContent {
  contentHash: string;
  score: number;
}

// Occurrence-level результат после expand + dedup.
export interface ScoredChunkOccurrence {
  chunkId: string;
  chunkContentHash: string;
  path: string;
  ordinal: number;
  score: number;
}

// Координа��ы фрагмента в исходном файле.
export interface ChunkCoordinates {
  startLine?: number;
  endLine?: number;
  fqn?: string;
  fragmentType?: string;
  headerPath?: string;
  pageStart?: number;
  pageEnd?: number;
}

// Оценки фрагмента по различным метрикам.
export interface ChunkScores {
  bm25: number | null;
  vector: number | null;
  rrf: number;
  rerank: number | null;
}

// Результат поиска — обогащённый фрагмент.
export interface SearchResult {
  chunkId: string;
  path: string;
  sourceType: string;
  sourceName: string;
  snippet: string;
  coordinates: ChunkCoordinates;
  scores: ChunkScores;
  // Branch-aware metadata (Task 7).
  viewKind?: string;
  refName?: string;
}

// Отв��т поиск�� с мета-информацией.
export interface SearchResponse {
  results: SearchResult[];
  totalCandidates: number;
  // Branch-aware metadata (Task 7).
  retrievalMode?: string;
}
