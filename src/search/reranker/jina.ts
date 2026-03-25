import type { Reranker, RerankDocument, RerankResult } from './types.js';
import { fetchWithRetry } from '../../utils/retry.js';

// Формат документов в запросе: объекты {text} (Jina) или строки (SiliconFlow).
type DocumentFormat = 'object' | 'string';

// Конфигурация Jina-совместимого Reranker.
interface JinaRerankerConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerName?: string;
  documentFormat?: DocumentFormat;
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

// URL Jina Reranker API по умолчанию.
const DEFAULT_BASE_URL = 'https://api.jina.ai/v1/rerank';

// Реализация Reranker через Jina-совместимый Reranker API.
export class JinaReranker implements Reranker {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly providerName: string;
  private readonly documentFormat: DocumentFormat;

  constructor(config: JinaRerankerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.providerName = config.providerName ?? 'Jina Reranker API';
    this.documentFormat = config.documentFormat ?? 'object';
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

    const docs = this.documentFormat === 'string'
      ? documents.map((d) => d.content)
      : documents.map((d) => ({ text: d.content }));

    const body = JSON.stringify({
      model: this.model,
      query,
      documents: docs,
      top_n: topK,
    });

    const response = await fetchWithRetry(
      this.baseUrl,
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
        errorPrefix: this.providerName,
      },
    );

    // Ошибка на не-ok статусы (не retryable — 4xx кроме 429).
    if (!response.ok) {
      throw new Error(
        `${this.providerName} error: ${response.status} ${response.statusText}`,
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
