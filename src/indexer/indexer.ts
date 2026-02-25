// Оркестрация индексации: chunk -> embed -> store.
import type { ChunkDispatcher } from '../chunks/index.js';
import type { FileContent } from '../chunks/types.js';
import type { TextEmbedder } from '../embeddings/types.js';
import type { ChunkStorage } from '../storage/chunks.js';
import type { SourceStorage } from '../storage/sources.js';
import type { SourceRow } from '../storage/schema.js';
import type { ScannedFile } from '../sources/local.js';
import type { IndexResult, ProgressReporter } from './progress.js';

// Размер батча для эмбеддингов.
const EMBED_BATCH_SIZE = 64;

// Пайплайн индексации источника.
export class Indexer {
  constructor(
    private chunkStorage: ChunkStorage,
    private sourceStorage: SourceStorage,
    private embedder: TextEmbedder,
    private dispatcher: ChunkDispatcher,
    private progress: ProgressReporter,
  ) {}

  // Индексирует файлы источника: chunk -> embed -> store.
  async indexSource(source: SourceRow, files: ScannedFile[]): Promise<IndexResult> {
    const startTime = Date.now();

    // 1. Чанкинг всех файлов.
    const allChunks = [];
    for (const file of files) {
      const fileContent: FileContent = {
        path: file.relativePath,
        content: file.content,
        sourceId: source.id,
      };
      const chunks = this.dispatcher.chunk(fileContent);
      allChunks.push(...chunks);
    }
    this.progress.onChunkComplete(allChunks.length, files.length);

    // 2. Удаляем старые чанки этого источника.
    await this.chunkStorage.deleteBySource(source.id);

    // 3. Генерируем эмбеддинги батчами.
    const embeddings: number[][] = [];
    for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
      const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((c) => c.content);
      const batchEmbeddings = await this.embedder.embedBatch(texts);
      embeddings.push(...batchEmbeddings);
      this.progress.onEmbedProgress(
        Math.min(i + EMBED_BATCH_SIZE, allChunks.length),
        allChunks.length,
      );
    }

    // 4. Сохраняем чанки с эмбеддингами в БД.
    const chunksWithEmbeddings = allChunks.map((chunk, i) => ({
      sourceId: chunk.sourceId,
      content: chunk.content,
      contentHash: chunk.contentHash,
      metadata: chunk.metadata,
      embedding: embeddings[i]!,
    }));
    await this.chunkStorage.insertBatch(chunksWithEmbeddings);
    this.progress.onStoreComplete();

    // 5. Обновляем метаданные источника.
    await this.sourceStorage.updateAfterIndex(source.id, allChunks.length);

    const result: IndexResult = {
      totalFiles: files.length,
      totalChunks: allChunks.length,
      newChunks: allChunks.length,
      duration: Date.now() - startTime,
    };

    this.progress.onComplete(result);
    return result;
  }
}
