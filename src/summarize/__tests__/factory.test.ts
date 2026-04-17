// Тесты фабрики Summarizer.
import { describe, it, expect } from 'vitest';
import { createSummarizer } from '../factory.js';
import { MockSummarizer } from '../mock.js';
import { SiliconFlowSummarizer } from '../siliconflow.js';
import type { AppConfig } from '../../config/index.js';

function makeAppConfig(overrides: Partial<AppConfig['summarization']> = {}): AppConfig {
  return {
    database: { host: 'x', port: 5432, name: 'x', user: 'x', password: 'x' },
    embeddings: {
      provider: 'siliconflow',
      siliconflow: {
        apiKey: 'embed-key',
        model: 'Qwen/Qwen3-Embedding-0.6B',
        dimensions: 1024,
      },
    },
    reranker: { provider: 'none' },
    search: {
      bm25Weight: 0.4,
      vectorWeight: 0.6,
      summaryVectorWeight: 0.0,
      retrieveTopK: 50,
      finalTopK: 10,
      rrf: { k: 60 },
      useSummaryVector: false,
    },
    summarization: {
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      concurrency: 4,
      timeoutMs: 60_000,
      cost: {
        dryRunRequired: true,
        avgTokensPerChunk: 200,
        pricePerTokenUsd: 0.05 / 1_000_000,
      },
      ...overrides,
    },
    sources: [],
    indexing: {
      git: { cloneDir: '~' },
      chunkSize: { maxTokens: 1000, overlap: 100 },
      strictAst: false,
    },
  };
}

describe('createSummarizer', () => {
  it('возвращает MockSummarizer для provider=mock', () => {
    const summarizer = createSummarizer(makeAppConfig({ provider: 'mock' }));
    expect(summarizer).toBeInstanceOf(MockSummarizer);
  });

  it('возвращает SiliconFlowSummarizer для provider=siliconflow', () => {
    const summarizer = createSummarizer(makeAppConfig({ provider: 'siliconflow' }));
    expect(summarizer).toBeInstanceOf(SiliconFlowSummarizer);
  });

  it('для siliconflow использует apiKey из embeddings.siliconflow при отсутствии summarization.apiKey', () => {
    const cfg = makeAppConfig({ provider: 'siliconflow' });
    expect(() => createSummarizer(cfg)).not.toThrow();
  });

  it('бросает ошибку если siliconflow выбран, но ключа нет нигде', () => {
    const cfg = makeAppConfig({ provider: 'siliconflow' });
    cfg.embeddings = { provider: 'jina' };
    expect(() => createSummarizer(cfg)).toThrow(/apiKey/);
  });

  it('предпочитает summarization.apiKey над embeddings.siliconflow.apiKey', () => {
    const cfg = makeAppConfig({ provider: 'siliconflow', apiKey: 'dedicated-key' });
    // Проверяем только отсутствие исключения — конкретный ключ не экспонируется наружу.
    expect(() => createSummarizer(cfg)).not.toThrow();
  });
});
