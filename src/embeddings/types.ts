// Интерфейс генератора эмбеддингов текста.
export interface TextEmbedder {
  // Генерация эмбеддинга для одного текста (passage).
  embed(input: string): Promise<number[]>;

  // Батч-генерация эмбеддингов (passage).
  embedBatch(inputs: string[]): Promise<number[][]>;

  // Генерация эмбеддинга запроса (может отличаться task prefix).
  embedQuery(input: string): Promise<number[]>;

  // Размерность вектора.
  readonly dimensions: number;
}
