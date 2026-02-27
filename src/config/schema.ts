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

// Схема конфигурации эмбеддингов.
export const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['jina', 'openai', 'self-hosted', 'mock']).default('jina'),
  jina: JinaEmbeddingsSchema.optional(),
  openai: OpenAIEmbeddingsSchema.optional(),
});

// Схема Jina Reranker.
export const JinaRerankerSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('jina-reranker-v2-base-multilingual'),
  topK: z.number().default(10),
});

// Схема конфигурации реранкера.
export const RerankerConfigSchema = z.object({
  provider: z.enum(['jina', 'none']).default('none'),
  jina: JinaRerankerSchema.optional(),
});

// Схема RRF (Reciprocal Rank Fusion).
export const RrfConfigSchema = z.object({
  k: z.number().default(60),
});

// Схема параметров поиска.
export const SearchConfigSchema = z.object({
  bm25Weight: z.number().default(0.4),
  vectorWeight: z.number().default(0.6),
  retrieveTopK: z.number().default(50),
  finalTopK: z.number().default(10),
  rrf: RrfConfigSchema.default(() => ({ k: 60 })),
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
    retrieveTopK: 50,
    finalTopK: 10,
    rrf: { k: 60 },
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
export type JinaRerankerConfig = z.infer<typeof JinaRerankerSchema>;
export type RerankerConfig = z.infer<typeof RerankerConfigSchema>;
export type RrfConfig = z.infer<typeof RrfConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type IndexingConfig = z.infer<typeof IndexingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
