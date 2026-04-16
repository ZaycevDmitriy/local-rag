// Агрегатор числа фрагментов источника по всем его source_views.
// После миграции 005 (branch-aware rebuild) счётчик chunk_count живёт в source_views,
// а колонка sources.chunk_count удалена из схемы. Использовать этот helper вместо
// устаревшего SourceRow.chunk_count, чтобы избежать undefined/NaN.
import type { SourceViewStorage } from '../../storage/index.js';

// Возвращает сумму chunk_count по всем views источника.
export async function sumChunksForSource(
  sourceViewStorage: SourceViewStorage,
  sourceId: string,
): Promise<number> {
  const views = await sourceViewStorage.listBySource(sourceId);
  return views.reduce((total, view) => total + view.chunk_count, 0);
}
