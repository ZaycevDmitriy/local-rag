// Интерфейсы модуля переранжирования результатов поиска.

// Документ для переранжирования.
export interface RerankDocument {
  id: string;
  content: string;
}

// Результат переранжирования одного документа.
export interface RerankResult {
  id: string;
  score: number;
  index: number;
}

// Абстракция реранкера.
export interface Reranker {
  rerank(query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]>;
}
