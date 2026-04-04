export interface TreeSitterStatus {
  typescript: 'active';
  javascript: 'active';
  java: 'active' | 'fallback';
  kotlin: 'active' | 'fallback';
}

export interface SystemStatusSnapshot {
  sourceCount: number;
  chunkCount: number;
  lastIndexedAt: string | null;
  appliedMigrations: string[];
  embeddingsProvider: string;
  rerankerProvider: string;
  search: {
    bm25Weight: number;
    vectorWeight: number;
    finalTopK: number;
    retrieveTopK: number;
  };
  treeSitterLanguages: TreeSitterStatus;
  // Branch-aware метрики (Task 8).
  viewCount: number;
  fileBlobCount: number;
  fileBlobSizeBytes: number;
  chunkContentCount: number;
  chunkContentWithEmbeddingCount: number;
}
