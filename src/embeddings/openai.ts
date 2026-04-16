import type { TextEmbedder } from './types.js';
import { fetchWithRetry } from '../utils/index.js';

// Конфигурация OpenAI-совместимых Embeddings.
interface OpenAIConfig {
  apiKey: string;
  model: string;
  dimensions: number;
  baseUrl?: string;
  providerName?: string;
}

// Структура ответа OpenAI API.
interface OpenAIEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

// Максимальное количество элементов в одном батче.
// Снижен с 100 до 64 для согласованности с indexer (32) и снижения объёма
// потери при truncated JSON от провайдера.
const BATCH_SIZE = 64;

// URL OpenAI Embeddings API по умолчанию.
const DEFAULT_BASE_URL = 'https://api.openai.com/v1/embeddings';

// Реализация TextEmbedder для OpenAI-совместимых Embeddings API.
export class OpenAITextEmbedder implements TextEmbedder {
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly providerName: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.providerName = config.providerName ?? 'OpenAI API';
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

    // Читаем body как текст, затем парсим вручную: это позволяет включить
    // фрагмент ответа в сообщение об ошибке при truncated JSON от провайдера
    // (SiliconFlow замечен в возврате оборванных ответов при высоких нагрузках).
    // response.json() потребляет stream безвозвратно — через text() получаем raw
    // для диагностики без потери данных.
    const text = await response.text();
    let json: OpenAIEmbeddingResponse;
    try {
      json = JSON.parse(text) as OpenAIEmbeddingResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const preview = text.slice(0, 200);
      console.error(
        `[OpenAITextEmbedder] Malformed JSON response: ${msg}. Body preview: ${preview}`,
      );
      throw new Error(
        `${this.providerName}: malformed JSON response (${msg}). Body[0..200]: ${preview}`,
      );
    }

    // Структурная валидация: без Zod, достаточно быстрой проверки формы.
    if (!json || !Array.isArray(json.data)) {
      const preview = text.slice(0, 200);
      console.error(
        `[OpenAITextEmbedder] Invalid response structure: missing data array. Body preview: ${preview}`,
      );
      throw new Error(
        `${this.providerName}: invalid response structure (missing data array). Body[0..200]: ${preview}`,
      );
    }

    for (let i = 0; i < json.data.length; i++) {
      const item = json.data[i]!;
      if (typeof item.index !== 'number' || !Array.isArray(item.embedding)) {
        const preview = text.slice(0, 200);
        console.error(
          `[OpenAITextEmbedder] Invalid response structure: data[${i}] has wrong shape. ` +
          `Body preview: ${preview}`,
        );
        throw new Error(
          `${this.providerName}: invalid response structure (data[${i}] wrong shape). ` +
          `Body[0..200]: ${preview}`,
        );
      }
    }

    console.error(`[OpenAITextEmbedder] Response validated: ${json.data.length} embeddings`);

    // Сортируем по index для гарантии порядка.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}
