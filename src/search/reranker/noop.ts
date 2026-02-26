import type { Reranker, RerankDocument, RerankResult } from './types.js';

// Passthrough-реранкер: возвращает документы в исходном порядке без изменений.
export class NoopReranker implements Reranker {
  async rerank(
    _query: string,
    documents: RerankDocument[],
    topK: number,
  ): Promise<RerankResult[]> {
    return documents.slice(0, topK).map((doc, index) => ({
      id: doc.id,
      score: 1.0,
      index,
    }));
  }
}
