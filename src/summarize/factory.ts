// Фабрика Summarizer по конфигу.
import type { AppConfig, SummarizationConfig } from '../config/index.js';
import { MockSummarizer } from './mock.js';
import { SiliconFlowSummarizer } from './siliconflow.js';
import type { Summarizer } from './types.js';

// URL SiliconFlow chat completions по умолчанию.
const SILICONFLOW_CHAT_URL = 'https://api.siliconflow.com/v1/chat/completions';

// Создаёт экземпляр Summarizer по конфигурации.
// Читает общий SILICONFLOW_API_KEY из config.embeddings.siliconflow, если apiKey не задан
// в summarization (для DRY конфига).
export function createSummarizer(appConfig: AppConfig): Summarizer {
  const cfg: SummarizationConfig = appConfig.summarization;

  switch (cfg.provider) {
  case 'mock':
    return new MockSummarizer();
  case 'siliconflow': {
    const apiKey = cfg.apiKey ?? appConfig.embeddings.siliconflow?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Summarization provider "siliconflow" requires apiKey (set summarization.apiKey ' +
        'or embeddings.siliconflow.apiKey in rag.config.yaml).',
      );
    }
    return new SiliconFlowSummarizer({
      apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl ?? SILICONFLOW_CHAT_URL,
      timeoutMs: cfg.timeoutMs,
    });
  }
  default:
    throw new Error(`Unsupported summarization provider: ${cfg.provider as string}`);
  }
}
