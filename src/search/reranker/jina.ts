import type { Reranker, RerankDocument, RerankResult } from './types.js';
import { fetchWithRetry } from '../../utils/retry.js';

// Конфигурация Jina Reranker.
interface JinaRerankerConfig {
  apiKey: string;
  model: string;
}

// Структура одного результата в ответе Jina Reranker API.
interface JinaRerankResultItem {
  index: number;
  relevance_score: number;
  document: { text: string };
}

// Структура ответа Jina Reranker API.
interface JinaRerankResponse {
  results: JinaRerankResultItem[];
}

// URL Jina Reranker API.
const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank';

// Реализация Reranker через Jina Reranker v2 API.
export class JinaReranker implements Reranker {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: JinaRerankerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  // Переранжирует документы по релевантности запросу.
  async rerank(
    query: string,
    documents: RerankDocument[],
    topK: number,
  ): Promise<RerankResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const body = JSON.stringify({
      model: this.model,
      query,
      documents: documents.map((d) => ({ text: d.content })),
      top_n: topK,
    });

    const response = await fetchWithRetry(
      JINA_RERANK_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        rateLimitDelayMs: 60_000,
        errorPrefix: 'Jina Reranker API',
      },
    );

    // Ошибка на не-ok статусы (не retryable — 4xx кроме 429).
    if (!response.ok) {
      throw new Error(
        `Jina Reranker API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as JinaRerankResponse;

    // Маппинг результатов: восстанавливаем id из исходного массива по index.
    return json.results.map((item) => ({
      id: documents[item.index]!.id,
      score: item.relevance_score,
      index: item.index,
    }));
  }
}
