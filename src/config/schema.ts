import { z } from 'zod';

// Схема подключения к PostgreSQL.
export const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  name: z.string().default('local_rag'),
  user: z.string().default('rag'),
  password: z.string().default('rag'),
});

// Схема Jina Embeddings.
export const JinaEmbeddingsSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('jina-embeddings-v3'),
  dimensions: z.number().default(1024),
});

// Схема OpenAI Embeddings.
export const OpenAIEmbeddingsSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('text-embedding-3-small'),
  dimensions: z.number().default(1536),
});

// Схема SiliconFlow Embeddings.
export const SiliconFlowEmbeddingsSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('Qwen/Qwen3-Embedding-0.6B'),
  dimensions: z.number().default(1024),
});

// Схема конфигурации эмбеддингов.
export const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['jina', 'openai', 'siliconflow']).default('jina'),
  jina: JinaEmbeddingsSchema.optional(),
  openai: OpenAIEmbeddingsSchema.optional(),
  siliconflow: SiliconFlowEmbeddingsSchema.optional(),
});

// Схема Jina Reranker.
export const JinaRerankerSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('jina-reranker-v2-base-multilingual'),
  topK: z.number().default(10),
});

// Схема SiliconFlow Reranker.
export const SiliconFlowRerankerSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('Qwen/Qwen3-Reranker-0.6B'),
  topK: z.number().default(10),
});

// Схема конфигурации реранкера.
export const RerankerConfigSchema = z.object({
  provider: z.enum(['jina', 'siliconflow', 'none']).default('none'),
  jina: JinaRerankerSchema.optional(),
  siliconflow: SiliconFlowRerankerSchema.optional(),
});

// Схема RRF (Reciprocal Rank Fusion).
export const RrfConfigSchema = z.object({
  k: z.number().default(60),
});

// Допуск суммы весов поиска при включённом 3-way (bm25 + vector + summaryVector).
const WEIGHT_SUM_TOLERANCE = 0.01;

// Схема параметров поиска.
// При useSummaryVector: true сумма весов (bm25Weight + vectorWeight + summaryVectorWeight)
// должна находиться в окрестности 1.0 ± WEIGHT_SUM_TOLERANCE.
// При useSummaryVector: false summaryVectorWeight игнорируется на runtime.
export const SearchConfigSchema = z.object({
  bm25Weight: z.number().default(0.4),
  vectorWeight: z.number().default(0.6),
  summaryVectorWeight: z.number().default(0.0),
  retrieveTopK: z.number().default(50),
  finalTopK: z.number().default(10),
  rrf: RrfConfigSchema.default(() => ({ k: 60 })),
  // Включает 3-way RRF поиск (BM25 + vec-content + vec-summary).
  useSummaryVector: z.boolean().default(false),
}).superRefine((cfg, ctx) => {
  if (!cfg.useSummaryVector) return;
  const sum = cfg.bm25Weight + cfg.vectorWeight + cfg.summaryVectorWeight;
  if (Math.abs(sum - 1.0) > WEIGHT_SUM_TOLERANCE) {
    ctx.addIssue({
      code: 'custom',
      path: ['summaryVectorWeight'],
      message:
        'search: при useSummaryVector=true сумма весов (bm25Weight + vectorWeight + summaryVectorWeight) ' +
        `должна быть 1.0 ± ${WEIGHT_SUM_TOLERANCE}, получено ${sum.toFixed(3)} ` +
        `(bm25=${cfg.bm25Weight}, vector=${cfg.vectorWeight}, summary=${cfg.summaryVectorWeight})`,
    });
  }
});

// Схема конфигурации summarization (LLM-генерация описаний чанков).
// Фича opt-in per source через `sources[].summarize: true`.
export const SummarizationCostSchema = z.object({
  // Требовать запуск `rag summarize --dry-run` с выводом cost estimate до первого реального прогона.
  dryRunRequired: z.boolean().default(true),
});

export const SummarizationConfigSchema = z.object({
  provider: z.enum(['siliconflow', 'mock']).default('siliconflow'),
  model: z.string().default('Qwen/Qwen2.5-7B-Instruct'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  // Параллельность вызовов LLM — ограничивает rate limits провайдера.
  concurrency: z.number().int().positive().default(4),
  // HTTP timeout per request в миллисекундах.
  timeoutMs: z.number().int().positive().default(60_000),
  cost: SummarizationCostSchema.default(() => ({ dryRunRequired: true })),
});

// Схема источника данных.
export const SourceConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'git']),
  path: z.string().optional(),
  url: z.string().optional(),
  branch: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  // Opt-in: разрешить LLM-суммаризацию чанков этого источника командой `rag summarize`.
  summarize: z.boolean().optional(),
});

// Схема параметров индексации.
export const IndexingConfigSchema = z.object({
  git: z.object({
    cloneDir: z.string().default('~/.local/share/rag/repos'),
  }).default(() => ({ cloneDir: '~/.local/share/rag/repos' })),
  chunkSize: z.object({
    maxTokens: z.number().default(1000),
    overlap: z.number().default(100),
  }).default(() => ({ maxTokens: 1000, overlap: 100 })),
  // Строгий режим: бросать ошибку если tree-sitter-грамматика не установлена.
  strictAst: z.boolean().default(false),
});

// Корневая схема конфигурации приложения.
export const AppConfigSchema = z.object({
  database: DatabaseConfigSchema.default(() => ({
    host: 'localhost',
    port: 5432,
    name: 'local_rag',
    user: 'rag',
    password: 'rag',
  })),
  embeddings: EmbeddingsConfigSchema.default(() => ({
    provider: 'jina' as const,
  })),
  reranker: RerankerConfigSchema.default(() => ({
    provider: 'none' as const,
  })),
  search: SearchConfigSchema.default(() => ({
    bm25Weight: 0.4,
    vectorWeight: 0.6,
    summaryVectorWeight: 0.0,
    retrieveTopK: 50,
    finalTopK: 10,
    rrf: { k: 60 },
    useSummaryVector: false,
  })),
  summarization: SummarizationConfigSchema.default(() => ({
    provider: 'siliconflow' as const,
    model: 'Qwen/Qwen2.5-7B-Instruct',
    concurrency: 4,
    timeoutMs: 60_000,
    cost: { dryRunRequired: true },
  })),
  sources: z.array(SourceConfigSchema).default([]),
  indexing: IndexingConfigSchema.default(() => ({
    git: { cloneDir: '~/.local/share/rag/repos' },
    chunkSize: { maxTokens: 1000, overlap: 100 },
    strictAst: false,
  })),
});

// Типы, выведенные из схем.
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type JinaEmbeddingsConfig = z.infer<typeof JinaEmbeddingsSchema>;
export type OpenAIEmbeddingsConfig = z.infer<typeof OpenAIEmbeddingsSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsConfigSchema>;
export type SiliconFlowEmbeddingsConfig = z.infer<typeof SiliconFlowEmbeddingsSchema>;
export type JinaRerankerConfig = z.infer<typeof JinaRerankerSchema>;
export type SiliconFlowRerankerConfig = z.infer<typeof SiliconFlowRerankerSchema>;
export type RerankerConfig = z.infer<typeof RerankerConfigSchema>;
export type RrfConfig = z.infer<typeof RrfConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type IndexingConfig = z.infer<typeof IndexingConfigSchema>;
export type SummarizationCostConfig = z.infer<typeof SummarizationCostSchema>;
export type SummarizationConfig = z.infer<typeof SummarizationConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
