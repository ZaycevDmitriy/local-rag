// Оркестрация индексации: chunk -> embed -> store с инкрементальной поддержкой.
import type { ChunkDispatcher } from '../chunks/index.js';
import type { FileContent } from '../chunks/types.js';
import type { TextEmbedder } from '../embeddings/types.js';
import type { ChunkStorage } from '../storage/chunks.js';
import type { IndexedFileStorage } from '../storage/indexed-files.js';
import type { SourceStorage } from '../storage/sources.js';
import type { SourceRow } from '../storage/schema.js';
import type { ScannedFile } from '../sources/local.js';
import { detectChanges } from './incremental.js';
import type { IndexResult, ProgressReporter } from './progress.js';

// Размер батча для эмбеддингов.
const EMBED_BATCH_SIZE = 64;

// Пайплайн индексации источника с инкрементальной поддержкой.
export class Indexer {
  constructor(
    private chunkStorage: ChunkStorage,
    private sourceStorage: SourceStorage,
    private embedder: TextEmbedder,
    private dispatcher: ChunkDispatcher,
    private progress: ProgressReporter,
    private indexedFileStorage: IndexedFileStorage,
  ) {}

  // Индексирует файлы источника инкрементально: обрабатывает только изменившиеся файлы.
  async indexSource(source: SourceRow, files: ScannedFile[]): Promise<IndexResult> {
    const startTime = Date.now();

    // 1. Определяем изменения.
    const changes = await detectChanges(source.id, files, this.indexedFileStorage);
    this.progress.onChangesDetected(changes);

    // 2. Удаляем чанки удалённых и изменённых файлов.
    for (const deletedPath of changes.deleted) {
      await this.chunkStorage.deleteByPath(source.id, deletedPath);
      await this.indexedFileStorage.deleteByPath(source.id, deletedPath);
    }
    for (const changedFile of changes.changed) {
      if (changedFile.status === 'modified') {
        await this.chunkStorage.deleteByPath(source.id, changedFile.path);
      }
    }

    // 3. Чанкинг только изменившихся файлов.
    const allChunks = [];
    for (const file of changes.changed) {
      const fileContent: FileContent = {
        path: file.path,
        content: file.content,
        sourceId: source.id,
      };
      const chunks = this.dispatcher.chunk(fileContent);
      allChunks.push(...chunks);
    }
    this.progress.onChunkComplete(allChunks.length, changes.changed.length);

    // 4. Генерируем эмбеддинги батчами (до записи в БД, чтобы не потерять данные при ошибке API).
    const embeddings: number[][] = [];
    if (allChunks.length > 0) {
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
    }

    // 5. Вставляем новые чанки.
    const chunksWithEmbeddings = allChunks.map((chunk, i) => ({
      sourceId: chunk.sourceId,
      content: chunk.content,
      contentHash: chunk.contentHash,
      metadata: chunk.metadata,
      embedding: embeddings[i]!,
    }));
    if (chunksWithEmbeddings.length > 0) {
      await this.chunkStorage.insertBatch(chunksWithEmbeddings);
    }
    this.progress.onStoreComplete();

    // 6. Обновляем хэши файлов в indexed_files.
    for (const file of changes.changed) {
      await this.indexedFileStorage.upsert(source.id, file.path, file.hash);
    }

    // 7. Получаем точное количество чанков после инкрементального обновления.
    const totalChunks = await this.chunkStorage.countBySource(source.id);

    // 8. Обновляем метаданные источника.
    await this.sourceStorage.updateAfterIndex(source.id, totalChunks);

    const result: IndexResult = {
      totalFiles: files.length,
      totalChunks,
      newChunks: allChunks.length,
      deletedFiles: changes.deleted.length,
      unchangedFiles: changes.unchanged,
      duration: Date.now() - startTime,
    };

    this.progress.onComplete(result);
    return result;
  }
}
