import type { Reranker, RerankDocument, RerankResult } from './types.js';

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

// Максимальное количество повторных попыток.
const MAX_RETRIES = 3;

// Базовая задержка между попытками (мс).
const BASE_DELAY_MS = 1000;

// URL Jina Reranker API.
const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank';

// Промис с задержкой для retry.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Экспоненциальная задержка: 1с, 2с, 4с.
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await delay(delayMs);
      }

      const response = await fetch(JINA_RERANK_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // Retry на 429 (rate limit) и 5xx (серверные ошибки).
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(
          `Jina Reranker API error: ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES) {
          continue;
        }
        throw lastError;
      }

      // Ошибка на остальные не-ok статусы — без retry.
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

    // Сюда не должны попасть, но на всякий случай.
    throw lastError ?? new Error('Jina Reranker API: unexpected retry exhaustion');
  }
}
