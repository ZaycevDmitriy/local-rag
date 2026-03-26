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
  SiliconFlowEmbeddingsSchema,
  JinaRerankerSchema,
  SiliconFlowRerankerSchema,
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
  SiliconFlowEmbeddingsConfig,
  JinaRerankerConfig,
  SiliconFlowRerankerConfig,
  RrfConfig,
} from './schema.js';

export { defaultConfig } from './defaults.js';

export { loadConfig, resolveEnvVars, deepMerge, resolveConfigPath } from './loader.js';
