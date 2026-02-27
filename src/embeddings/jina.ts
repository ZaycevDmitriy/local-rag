import type { TextEmbedder } from './types.js';

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

// Максимальное количество повторных попыток.
const MAX_RETRIES = 5;

// Базовая задержка между попытками при 5xx (мс).
const BASE_DELAY_MS = 1000;

// Задержка при 429 Too Many Requests (мс): 60с, 120с, 240с...
const RATE_LIMIT_DELAY_MS = 60_000;

// URL Jina Embeddings API.
const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';

// Промис с задержкой для retry.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // При 429 — фиксированная задержка 60с * попытка; при 5xx — экспоненциальная.
        const delayMs = lastError?.message.includes('429')
          ? RATE_LIMIT_DELAY_MS * attempt
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        process.stderr.write(`  [jina] retry ${attempt}/${MAX_RETRIES}, wait ${Math.round(delayMs / 1000)}s\n`);
        await delay(delayMs);
      }

      const response = await fetch(JINA_API_URL, {
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
          `Jina API error: ${response.status} ${response.statusText}`,
        );
        if (attempt < MAX_RETRIES) {
          continue;
        }
        throw lastError;
      }

      // Ошибка на остальные не-ok статусы — без retry.
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

    // Сюда не должны попасть, но на всякий случай.
    throw lastError ?? new Error('Jina API: unexpected retry exhaustion');
  }
}
