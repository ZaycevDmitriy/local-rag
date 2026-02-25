// Barrel-файл модуля конфигурации.
export {
  AppConfigSchema,
  DatabaseConfigSchema,
  EmbeddingsConfigSchema,
  RerankerConfigSchema,
  SearchConfigSchema,
  SourceConfigSchema,
  IndexingConfigSchema,
  JinaEmbeddingsSchema,
  OpenAIEmbeddingsSchema,
  JinaRerankerSchema,
  RrfConfigSchema,
} from './schema.js';

export type {
  AppConfig,
  DatabaseConfig,
  EmbeddingsConfig,
  RerankerConfig,
  SearchConfig,
  SourceConfig,
  IndexingConfig,
  JinaEmbeddingsConfig,
  OpenAIEmbeddingsConfig,
  JinaRerankerConfig,
  RrfConfig,
} from './schema.js';

export { defaultConfig } from './defaults.js';

export { loadConfig, resolveEnvVars, deepMerge } from './loader.js';
