import type { TextEmbedder } from './types.js';

// Конфигурация OpenAI Embeddings.
interface OpenAIConfig {
  apiKey: string;
  model: string;
  dimensions: number;
}

// Структура ответа OpenAI API.
interface OpenAIEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

// Максимальное количество элементов в одном батче.
const BATCH_SIZE = 100;

// Максимальное количество повторных попыток.
const MAX_RETRIES = 3;

// Базовая задержка между попытками (мс).
const BASE_DELAY_MS = 1000;

// URL OpenAI Embeddings API.
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

// Промис с задержкой для retry.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Реализация TextEmbedder для OpenAI Embeddings.
export class OpenAITextEmbedder implements TextEmbedder {
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  // Генерация эмбеддинга для одного текста.
  async embed(input: string): Promise<number[]> {
    const results = await this.callApi([input]);
    return results[0]!;
  }

  // Батч-генерация эмбеддингов.
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
      const batchResults = await this.callApi(batch);
      allResults.push(...batchResults);
    }

    return allResults;
  }

  // Генерация эмбеддинга для поискового запроса (идентична embed, OpenAI не различает задачи).
  async embedQuery(input: string): Promise<number[]> {
    return this.embed(input);
  }

  // Вызов OpenAI API с retry логикой.
  private async callApi(input: string[]): Promise<number[][]> {
    const body = JSON.stringify({
      model: this.model,
      input,
      dimensions: this.dimensions,
    });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Экспоненциальная задержка: 1с, 2с, 4с.
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await delay(delayMs);
      }

      const response = await fetch(OPENAI_API_URL, {
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
          `OpenAI API error: ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES) {
          continue;
        }
        throw lastError;
      }

      // Ошибка на остальные не-ok статусы — без retry.
      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const json = (await response.json()) as OpenAIEmbeddingResponse;

      // Сортируем по index для гарантии порядка.
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    }

    // Сюда не должны попасть, но на всякий случай.
    throw lastError ?? new Error('OpenAI API: unexpected retry exhaustion');
  }
}
