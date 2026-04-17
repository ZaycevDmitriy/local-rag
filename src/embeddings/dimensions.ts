import type { EmbeddingsConfig } from '../config/index.js';

// Fallback, когда провайдер не указан или под-объект провайдера отсутствует.
// Совпадает с `vector(1024)` в initialMigration до применения миграций 005/006.
export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;

// Резолв размерности вектора эмбеддингов по активному провайдеру.
// В отличие от прежнего резолва в init.ts, который смотрел на факт наличия
// под-объекта jina/openai, эта функция привязывается к `config.provider` —
// что предотвращает несоответствие размерностей колонки и embedder-а
// при `provider: siliconflow` с кастомной dimensions.
export function resolveEmbeddingDimensions(config: EmbeddingsConfig): number {
  switch (config.provider) {
  case 'jina':
    return config.jina?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  case 'openai':
    return config.openai?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  case 'siliconflow':
    return config.siliconflow?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  default:
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }
}
