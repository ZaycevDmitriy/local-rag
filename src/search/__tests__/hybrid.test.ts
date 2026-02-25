import { describe, it, expect } from 'vitest';
import { rrfFuse } from '../hybrid.js';
import type { ScoredChunk } from '../types.js';

describe('rrfFuse', () => {
  it('суммирует оценки для документов, присутствующих в обоих списках', () => {
    const bm25: ScoredChunk[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.8 },
    ];
    const vector: ScoredChunk[] = [
      { id: 'b', score: 0.95 },
      { id: 'a', score: 0.85 },
    ];

    const result = rrfFuse(bm25, vector, 60, 0.4, 0.6);

    // Документ 'a': bm25 rank=1 -> 0.4/(60+1) + vector rank=2 -> 0.6/(60+2).
    const expectedA = 0.4 / 61 + 0.6 / 62;
    // Документ 'b': bm25 rank=2 -> 0.4/(60+2) + vector rank=1 -> 0.6/(60+1).
    const expectedB = 0.4 / 62 + 0.6 / 61;

    const scoreMap = new Map(result.map((r) => [r.id, r.score]));

    expect(scoreMap.get('a')).toBeCloseTo(expectedA, 10);
    expect(scoreMap.get('b')).toBeCloseTo(expectedB, 10);
  });

  it('обрабатывает непересекающиеся результаты', () => {
    const bm25: ScoredChunk[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.8 },
    ];
    const vector: ScoredChunk[] = [
      { id: 'c', score: 0.95 },
      { id: 'd', score: 0.85 },
    ];

    const result = rrfFuse(bm25, vector, 60, 0.4, 0.6);

    expect(result).toHaveLength(4);

    const scoreMap = new Map(result.map((r) => [r.id, r.score]));

    // Каждый документ только из одного списка — score от другого = 0.
    expect(scoreMap.get('a')).toBeCloseTo(0.4 / 61, 10);
    expect(scoreMap.get('b')).toBeCloseTo(0.4 / 62, 10);
    expect(scoreMap.get('c')).toBeCloseTo(0.6 / 61, 10);
    expect(scoreMap.get('d')).toBeCloseTo(0.6 / 62, 10);
  });

  it('возвращает пустой массив при пустых входных списках', () => {
    const result = rrfFuse([], []);

    expect(result).toEqual([]);
  });

  it('обрабатывает пустой BM25-список — только vector scores', () => {
    const vector: ScoredChunk[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.8 },
    ];

    const result = rrfFuse([], vector, 60, 0.4, 0.6);

    expect(result).toHaveLength(2);

    const scoreMap = new Map(result.map((r) => [r.id, r.score]));

    expect(scoreMap.get('a')).toBeCloseTo(0.6 / 61, 10);
    expect(scoreMap.get('b')).toBeCloseTo(0.6 / 62, 10);
  });

  it('обрабатывает пустой vector-список — только BM25 scores', () => {
    const bm25: ScoredChunk[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.8 },
    ];

    const result = rrfFuse(bm25, [], 60, 0.4, 0.6);

    expect(result).toHaveLength(2);

    const scoreMap = new Map(result.map((r) => [r.id, r.score]));

    expect(scoreMap.get('a')).toBeCloseTo(0.4 / 61, 10);
    expect(scoreMap.get('b')).toBeCloseTo(0.4 / 62, 10);
  });

  it('сортирует результаты по убыванию rrf_score', () => {
    // Документ 'c' в обоих на первой позиции — максимальный score.
    const bm25: ScoredChunk[] = [
      { id: 'c', score: 0.9 },
      { id: 'a', score: 0.5 },
    ];
    const vector: ScoredChunk[] = [
      { id: 'c', score: 0.95 },
      { id: 'b', score: 0.7 },
    ];

    const result = rrfFuse(bm25, vector, 60, 0.4, 0.6);

    // 'c' имеет наивысший score (в обоих списках).
    expect(result[0]!.id).toBe('c');

    // Проверяем общий порядок убывания.
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it('использует значения по умолчанию (k=60, bm25Weight=0.4, vectorWeight=0.6)', () => {
    const bm25: ScoredChunk[] = [{ id: 'a', score: 1.0 }];
    const vector: ScoredChunk[] = [{ id: 'a', score: 1.0 }];

    // Вызов без явных параметров — используются дефолты.
    const result = rrfFuse(bm25, vector);

    const expectedScore = 0.4 / (60 + 1) + 0.6 / (60 + 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
    expect(result[0]!.score).toBeCloseTo(expectedScore, 10);
  });

  it('корректно работает с кастомными параметрами', () => {
    const bm25: ScoredChunk[] = [{ id: 'a', score: 1.0 }];
    const vector: ScoredChunk[] = [{ id: 'a', score: 1.0 }];

    const result = rrfFuse(bm25, vector, 10, 0.5, 0.5);

    // k=10, bm25Weight=0.5, vectorWeight=0.5.
    const expectedScore = 0.5 / (10 + 1) + 0.5 / (10 + 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBeCloseTo(expectedScore, 10);
  });

  it('обрабатывает один документ в обоих списках на разных рангах', () => {
    const bm25: ScoredChunk[] = [
      { id: 'x', score: 0.9 },
      { id: 'y', score: 0.8 },
      { id: 'shared', score: 0.7 },
    ];
    const vector: ScoredChunk[] = [
      { id: 'shared', score: 0.95 },
      { id: 'z', score: 0.85 },
    ];

    const result = rrfFuse(bm25, vector, 60, 0.4, 0.6);

    // 'shared': bm25 rank=3 -> 0.4/(60+3) + vector rank=1 -> 0.6/(60+1).
    const expectedShared = 0.4 / 63 + 0.6 / 61;

    const scoreMap = new Map(result.map((r) => [r.id, r.score]));

    expect(scoreMap.get('shared')).toBeCloseTo(expectedShared, 10);
    expect(result).toHaveLength(4); // x, y, shared, z — все уникальные.
  });

  it('не зависит от исходных score — использует только ранги', () => {
    // Оценки в исходных списках разные, но ранги одинаковые.
    const bm25High: ScoredChunk[] = [{ id: 'a', score: 100.0 }];
    const bm25Low: ScoredChunk[] = [{ id: 'a', score: 0.001 }];

    const resultHigh = rrfFuse(bm25High, [], 60, 0.4, 0.6);
    const resultLow = rrfFuse(bm25Low, [], 60, 0.4, 0.6);

    // RRF-оценки одинаковы, потому что ранг одинаковый (rank=1).
    expect(resultHigh[0]!.score).toBeCloseTo(resultLow[0]!.score, 10);
  });

  it('корректно обрабатывает большое количество документов', () => {
    const bm25: ScoredChunk[] = Array.from({ length: 50 }, (_, i) => ({
      id: `doc-${i}`,
      score: 1 - i * 0.01,
    }));
    const vector: ScoredChunk[] = Array.from({ length: 50 }, (_, i) => ({
      id: `doc-${49 - i}`,
      score: 1 - i * 0.01,
    }));

    const result = rrfFuse(bm25, vector, 60, 0.4, 0.6);

    // Все 50 документов присутствуют (пересечение полное).
    expect(result).toHaveLength(50);

    // Первый результат должен иметь наибольший score.
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });
});
