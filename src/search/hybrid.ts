// RRF (Reciprocal Rank Fusion) — объединение 2 или 3 ранжированных списков.
import type { ScoredChunk } from './types.js';

// Значения по умолчанию для RRF.
const DEFAULT_K = 60;
const DEFAULT_BM25_WEIGHT = 0.4;
const DEFAULT_VECTOR_WEIGHT = 0.6;

// Добавляет в accumulator вклад одного списка с весом.
// Ранг — 1-based позиция в списке; документ появляется в accumulator один раз
// независимо от того, сколько списков его содержат.
function accumulate(
  results: ScoredChunk[],
  k: number,
  weight: number,
  accumulator: Map<string, number>,
): void {
  if (weight === 0 || results.length === 0) return;

  for (let i = 0; i < results.length; i++) {
    const chunk = results[i]!;
    const rank = i + 1;
    const rrfScore = weight / (k + rank);
    accumulator.set(chunk.id, (accumulator.get(chunk.id) ?? 0) + rrfScore);
  }
}

// Объединяет результаты BM25 и vector search с помощью Reciprocal Rank Fusion.
// Опциональный 3-й список (summary vector) добавляется с независимым весом.
// Формула: rrf_score(d) = Σ weight_ch / (k + rank_ch) по каналам, в которых d присутствует.
// Если документ присутствует только в одном списке, его score из других равен 0.
export function rrfFuse(
  bm25Results: ScoredChunk[],
  vectorResults: ScoredChunk[],
  k: number = DEFAULT_K,
  bm25Weight: number = DEFAULT_BM25_WEIGHT,
  vectorWeight: number = DEFAULT_VECTOR_WEIGHT,
  summaryVectorResults: ScoredChunk[] = [],
  summaryVectorWeight = 0,
): ScoredChunk[] {
  const scores = new Map<string, number>();

  accumulate(bm25Results, k, bm25Weight, scores);
  accumulate(vectorResults, k, vectorWeight, scores);
  accumulate(summaryVectorResults, k, summaryVectorWeight, scores);

  const fused: ScoredChunk[] = [];

  for (const [id, score] of scores) {
    fused.push({ id, score });
  }

  fused.sort((a, b) => b.score - a.score);

  return fused;
}
