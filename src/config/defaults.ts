import type { AppConfig } from './schema.js';

// Значения по умолчанию для конфигурации.
// Используются при deep-merge с пользовательским конфигом до валидации.
export const defaultConfig: AppConfig = {
  database: {
    host: 'localhost',
    port: 5432,
    name: 'local_rag',
    user: 'rag',
    password: 'rag',
  },
  embeddings: {
    provider: 'jina',
  },
  reranker: {
    provider: 'none',
  },
  search: {
    bm25Weight: 0.4,
    vectorWeight: 0.6,
    retrieveTopK: 50,
    finalTopK: 10,
    rrf: {
      k: 60,
    },
  },
  sources: [],
  indexing: {
    git: {
      cloneDir: '~/.local/share/rag/repos',
    },
    chunkSize: {
      maxTokens: 1000,
      overlap: 100,
    },
    strictAst: false,
  },
};
