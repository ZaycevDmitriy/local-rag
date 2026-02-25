// RRF (Reciprocal Rank Fusion) — объединение результатов BM25 и vector search.
import type { ScoredChunk } from './types.js';

// Значения по умолчанию для RRF.
const DEFAULT_K = 60;
const DEFAULT_BM25_WEIGHT = 0.4;
const DEFAULT_VECTOR_WEIGHT = 0.6;

// Объединяет результаты BM25 и vector search с помощью Reciprocal Rank Fusion.
// Формула: rrf_score(d) = bm25Weight / (k + rank_bm25) + vectorWeight / (k + rank_vector).
// Если документ присутствует только в одном списке, его score из другого равен 0.
export function rrfFuse(
  bm25Results: ScoredChunk[],
  vectorResults: ScoredChunk[],
  k: number = DEFAULT_K,
  bm25Weight: number = DEFAULT_BM25_WEIGHT,
  vectorWeight: number = DEFAULT_VECTOR_WEIGHT,
): ScoredChunk[] {
  // Накопитель RRF-оценок по ID документа.
  const scores = new Map<string, number>();

  // Начисляем баллы BM25. Ранг — 1-based позиция в списке.
  for (let i = 0; i < bm25Results.length; i++) {
    const chunk = bm25Results[i]!;
    const rank = i + 1;
    const rrfScore = bm25Weight / (k + rank);
    scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + rrfScore);
  }

  // Начисляем баллы vector search. Ранг — 1-based позиция в списке.
  for (let i = 0; i < vectorResults.length; i++) {
    const chunk = vectorResults[i]!;
    const rank = i + 1;
    const rrfScore = vectorWeight / (k + rank);
    scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + rrfScore);
  }

  // Формируем результат и сортируем по убыванию RRF-оценки.
  const fused: ScoredChunk[] = [];

  for (const [id, score] of scores) {
    fused.push({ id, score });
  }

  fused.sort((a, b) => b.score - a.score);

  return fused;
}
