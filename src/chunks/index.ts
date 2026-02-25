// Barrel-файл модуля чанкинга.
export type {
  FileContent,
  ChunkMetadata,
  Chunk,
  Chunker,
  ChunkSizeConfig,
} from './types.js';

export { createChunk } from './types.js';

export { MarkdownChunker } from './markdown/markdown-chunker.js';
export { FixedSizeChunker } from './text/fixed-chunker.js';
export { ChunkDispatcher } from './dispatcher.js';
