import { describe, it, expect } from 'vitest';
import {
  resolveEmbeddingDimensions,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from '../dimensions.js';
import type { EmbeddingsConfig } from '../../config/index.js';

// Минимальный суб-конфиг провайдера с обязательным apiKey, зафиксированной model
// и изменяемой dimensions — используется для проверки приоритета `provider` над
// присутствием под-объектов других провайдеров.
function jinaCfg(dimensions: number) {
  return { apiKey: 'k', model: 'jina-embeddings-v3', dimensions };
}
function openaiCfg(dimensions: number) {
  return { apiKey: 'k', model: 'text-embedding-3-small', dimensions };
}
function siliconflowCfg(dimensions: number) {
  return { apiKey: 'k', model: 'Qwen/Qwen3-Embedding-0.6B', dimensions };
}

describe('resolveEmbeddingDimensions', () => {
  it('provider=jina с дефолтными dimensions=1024 → 1024', () => {
    const config: EmbeddingsConfig = {
      provider: 'jina',
      jina: jinaCfg(1024),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(1024);
  });

  it('provider=jina с кастомными dimensions=2048 → 2048', () => {
    const config: EmbeddingsConfig = {
      provider: 'jina',
      jina: jinaCfg(2048),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(2048);
  });

  it('provider=openai с дефолтными dimensions=1536 → 1536', () => {
    const config: EmbeddingsConfig = {
      provider: 'openai',
      openai: openaiCfg(1536),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(1536);
  });

  it('provider=openai с кастомными dimensions=3072 → 3072', () => {
    const config: EmbeddingsConfig = {
      provider: 'openai',
      openai: openaiCfg(3072),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(3072);
  });

  it('provider=siliconflow с дефолтными dimensions=1024 → 1024', () => {
    const config: EmbeddingsConfig = {
      provider: 'siliconflow',
      siliconflow: siliconflowCfg(1024),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(1024);
  });

  // Главный regression-case: прежний резолв игнорировал provider и возвращал 1024,
  // что приводило бы к vector(1024) в миграциях и падению INSERT при реальной dimension=4096.
  it('provider=siliconflow с кастомными dimensions=4096 → 4096 (regression PR #11)', () => {
    const config: EmbeddingsConfig = {
      provider: 'siliconflow',
      siliconflow: siliconflowCfg(4096),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(4096);
  });

  it('provider=siliconflow без под-объекта → fallback DEFAULT_EMBEDDING_DIMENSIONS', () => {
    const config: EmbeddingsConfig = {
      provider: 'siliconflow',
    };
    expect(resolveEmbeddingDimensions(config)).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
  });

  // Проверка, что именно provider, а не наличие jina/openai-конфигов, определяет результат.
  it('provider=siliconflow игнорирует jina/openai под-объекты из конфига', () => {
    const config: EmbeddingsConfig = {
      provider: 'siliconflow',
      jina: jinaCfg(2048),
      openai: openaiCfg(3072),
      siliconflow: siliconflowCfg(4096),
    };
    expect(resolveEmbeddingDimensions(config)).toBe(4096);
  });
});
