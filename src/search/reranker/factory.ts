import type { RerankerConfig } from '../../config/schema.js';
import type { Reranker } from './types.js';
import { JinaReranker } from './jina.js';
import { NoopReranker } from './noop.js';

// Создание экземпляра Reranker по конфигурации.
export function createReranker(config: RerankerConfig): Reranker {
  switch (config.provider) {
  case 'jina': {
    if (!config.jina) {
      throw new Error('Jina reranker config is required when provider is "jina"');
    }
    return new JinaReranker({
      apiKey: config.jina.apiKey,
      model: config.jina.model,
    });
  }
  case 'siliconflow': {
    if (!config.siliconflow) {
      throw new Error('SiliconFlow reranker config is required when provider is "siliconflow"');
    }
    return new JinaReranker({
      apiKey: config.siliconflow.apiKey,
      model: config.siliconflow.model,
      baseUrl: 'https://api.siliconflow.com/v1/rerank',
      providerName: 'SiliconFlow Reranker API',
      documentFormat: 'string',
    });
  }
  case 'none':
    return new NoopReranker();
  default:
    throw new Error(`Unsupported reranker provider: ${config.provider as string}`);
  }
}
