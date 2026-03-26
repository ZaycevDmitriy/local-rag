import type { TextEmbedder } from './types.js';
import { fetchWithRetry } from '../utils/index.js';

// Конфигурация Jina Embeddings.
interface JinaConfig {
  apiKey: string;
  model: string;
  dimensions: number;
}

// Тип задачи для Jina API.
type JinaTask = 'retrieval.passage' | 'retrieval.query';

// Структура ответа Jina API.
interface JinaEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

// Максимальное количество элементов в одном батче.
const BATCH_SIZE = 64;

// URL Jina Embeddings API.
const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';

// Реализация TextEmbedder для Jina Embeddings v3.
export class JinaTextEmbedder implements TextEmbedder {
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: JinaConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  // Генерация эмбеддинга для одного passage-текста.
  async embed(input: string): Promise<number[]> {
    const results = await this.callApi([input], 'retrieval.passage');
    return results[0]!;
  }

  // Батч-генерация эмбеддингов для passage-текстов.
  async embedBatch(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) {
      return [];
    }

    // Разбиваем на батчи по BATCH_SIZE элементов.
    const batches: string[][] = [];
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      batches.push(inputs.slice(i, i + BATCH_SIZE));
    }

    // Обрабатываем батчи последовательно, чтобы не превысить rate limit.
    const allResults: number[][] = [];
    for (const batch of batches) {
      const batchResults = await this.callApi(batch, 'retrieval.passage');
      allResults.push(...batchResults);
    }

    return allResults;
  }

  // Генерация эмбеддинга для поискового запроса.
  async embedQuery(input: string): Promise<number[]> {
    const results = await this.callApi([input], 'retrieval.query');
    return results[0]!;
  }

  // Вызов Jina API с retry логикой.
  private async callApi(input: string[], task: JinaTask): Promise<number[][]> {
    const body = JSON.stringify({
      model: this.model,
      input,
      task,
      dimensions: this.dimensions,
      // Автоматически обрезает тексты превышающие лимит модели.
      truncate: true,
    });

    const response = await fetchWithRetry(
      JINA_API_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      },
      {
        maxRetries: 5,
        baseDelayMs: 1000,
        rateLimitDelayMs: 60_000,
        errorPrefix: 'Jina API',
        onRetry: (attempt, maxRetries, delayMs) => {
          process.stderr.write(`  [jina] retry ${attempt}/${maxRetries}, wait ${Math.round(delayMs / 1000)}s\n`);
        },
      },
    );

    // Ошибка на не-ok статусы (не retryable — 4xx кроме 429).
    if (!response.ok) {
      throw new Error(
        `Jina API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as JinaEmbeddingResponse;

    // Сортируем по index для гарантии порядка.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}
