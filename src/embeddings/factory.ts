import type { EmbeddingsConfig } from '../config/schema.js';
import type { TextEmbedder } from './types.js';
import { JinaTextEmbedder } from './jina.js';
import { MockTextEmbedder } from './mock.js';
import { OpenAITextEmbedder } from './openai.js';

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
  case 'openai': {
    if (!config.openai) {
      throw new Error('OpenAI embeddings config is required when provider is "openai"');
    }
    return new OpenAITextEmbedder({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      dimensions: config.openai.dimensions,
    });
  }
  case 'self-hosted':
    throw new Error('Self-hosted embedder not implemented yet');
  default:
    throw new Error(`Unsupported embeddings provider: ${config.provider as string}`);
  }
}
