import type { EmbeddingsConfig } from '../config/schema.js';
import type { TextEmbedder } from './types.js';
import { JinaTextEmbedder } from './jina.js';
import { MockTextEmbedder } from './mock.js';

// Создание экземпляра TextEmbedder по конфигурации.
export function createTextEmbedder(config: EmbeddingsConfig): TextEmbedder {
  switch (config.provider) {
  case 'jina': {
    if (!config.jina) {
      throw new Error('Jina embeddings config is required when provider is "jina"');
    }
    return new JinaTextEmbedder({
      apiKey: config.jina.apiKey,
      model: config.jina.model,
      dimensions: config.jina.dimensions,
    });
  }
  case 'mock':
    return new MockTextEmbedder();
  case 'openai':
    throw new Error('OpenAI embedder not implemented yet');
  case 'self-hosted':
    throw new Error('Self-hosted embedder not implemented yet');
  default:
    throw new Error(`Unsupported embeddings provider: ${config.provider as string}`);
  }
}
