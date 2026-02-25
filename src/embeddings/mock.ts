// Mock embedder для тестирования без внешнего API.
// Генерирует детерминированные векторы на основе хэша контента.
import { createHash } from 'node:crypto';
import type { TextEmbedder } from './types.js';

// Генерирует псевдо-случайный вектор на основе seed-строки.
function hashToVector(input: string, dimensions: number): number[] {
  const hash = createHash('sha256').update(input).digest();
  const vector: number[] = [];

  for (let i = 0; i < dimensions; i++) {
    // Используем байты хэша циклически для заполнения вектора.
    const byte = hash[i % hash.length]!;
    // Нормализуем в диапазон [-1, 1].
    vector.push((byte / 127.5) - 1);
  }

  // Нормализуем вектор (unit length).
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / norm);
}

// Mock-реализация TextEmbedder для тестирования.
export class MockTextEmbedder implements TextEmbedder {
  readonly dimensions: number;

  constructor(dimensions = 1024) {
    this.dimensions = dimensions;
  }

  async embed(input: string): Promise<number[]> {
    return hashToVector(input, this.dimensions);
  }

  async embedBatch(inputs: string[]): Promise<number[][]> {
    return inputs.map((input) => hashToVector(input, this.dimensions));
  }

  async embedQuery(input: string): Promise<number[]> {
    return hashToVector(`query:${input}`, this.dimensions);
  }
}
