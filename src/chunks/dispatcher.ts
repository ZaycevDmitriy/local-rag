import type { Chunk, Chunker, FileContent } from './types.js';

// Диспетчер выбирает подходящий чанкер для файла.
// Проверяет chunkers по порядку, первый поддерживающий файл — выигрывает.
// Если ни один не подходит — используется fallback (FixedSizeChunker).
export class ChunkDispatcher {
  private readonly chunkers: Chunker[];
  private readonly fallback: Chunker;

  constructor(chunkers: Chunker[], fallback: Chunker) {
    this.chunkers = chunkers;
    this.fallback = fallback;
  }

  chunk(file: FileContent): Chunk[] {
    for (const chunker of this.chunkers) {
      if (chunker.supports(file.path)) {
        return chunker.chunk(file);
      }
    }
    return this.fallback.chunk(file);
  }
}
