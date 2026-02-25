// Типы модуля поиска.

// Запрос на поиск.
export interface SearchQuery {
  query: string;
  topK?: number;
  sourceId?: string;
  sourceType?: string;
  pathPrefix?: string;
}

// Фрагмент с оценкой (промежуточный результат).
export interface ScoredChunk {
  id: string;
  score: number;
}

// Координаты фрагмента в исходном файле.
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
}

// Ответ поиска с мета-информацией.
export interface SearchResponse {
  results: SearchResult[];
  totalCandidates: number;
}
