// Оркестрация индексации: chunk -> embed -> store с инкрементальной поддержкой.
import type { ChunkDispatcher, FileContent } from '../chunks/index.js';
import type { TextEmbedder } from '../embeddings/index.js';
import type {
  ChunkContentInsert,
  ChunkStorage,
  ChunkContentStorage,
  ChunkOccurrenceInsert,
  FileBlobStorage,
  IndexedFileStorage,
  SourceRow,
  SourceStorage,
  SourceViewRow,
  SourceViewStorage,
} from '../storage/index.js';
import type { ScannedFile } from '../sources/index.js';
import { pMap } from '../utils/index.js';
import { buildChunkMetadataJson } from './_helpers/metadata.js';
import { detectChanges, type ChangedFile } from './incremental.js';
import type { IndexResult, ProgressReporter } from './progress.js';

// Размер батча для эмбеддингов.
// Снижен с 64 до 32: ограничивает объём потери при failed batch и даёт более
// плавный прогресс. Trade-off — удвоение числа API-вызовов per indexing run;
// компенсируется per-batch isolation + retry из Task 5.
const EMBED_BATCH_SIZE = 32;

// Количество параллельных запросов к API эмбеддингов.
const EMBED_CONCURRENCY = 3;

// Пайплайн индексации с branch-aware и legacy поддержкой.
export class Indexer {
  constructor(
    private chunkStorage: ChunkStorage,
    private sourceStorage: SourceStorage,
    private embedder: TextEmbedder,
    private dispatcher: ChunkDispatcher,
    private progress: ProgressReporter,
    private indexedFileStorage: IndexedFileStorage,
    private sourceViewStorage?: SourceViewStorage,
    private fileBlobStorage?: FileBlobStorage,
    private chunkContentStorage?: ChunkContentStorage,
  ) {}

  /**
   * Branch-aware индексация view.
   * Runtime определяет changed/deleted файлы; Indexer отвечает за
   * chunking, blob storage, content dedup, embedding.
   */
  async indexView(
    view: SourceViewRow,
    changedFiles: ChangedFile[],
    deletedPaths: string[],
    context?: { totalFileCount: number; unchangedFileCount: number; strategy: string },
  ): Promise<IndexResult> {
    const startTime = Date.now();

    if (!this.fileBlobStorage || !this.chunkContentStorage) {
      throw new Error('[Indexer] branch-aware storage не инициализирован');
    }

    // 1. Удаляем chunks и indexed_files для удалённых файлов.
    if (deletedPaths.length > 0) {
      const existingFiles = await this.indexedFileStorage.getByView(view.id);
      const deletedFileIds = existingFiles
        .filter((f) => deletedPaths.includes(f.path))
        .map((f) => f.id);

      if (deletedFileIds.length > 0) {
        await this.chunkStorage.deleteByIndexedFileIds(deletedFileIds);
        await this.indexedFileStorage.deleteByIds(deletedFileIds);
        console.log(`[Indexer] deleted: ${deletedFileIds.length} files, paths=${deletedPaths.join(', ')}`);
      }
    }

    // 2. Удаляем старые chunks для изменённых файлов (будут пересозданы).
    if (changedFiles.length > 0) {
      const changedPaths = changedFiles.map((f) => f.path);
      const existingFiles = await this.indexedFileStorage.getByView(view.id);
      const modifiedFileIds = existingFiles
        .filter((f) => changedPaths.includes(f.path))
        .map((f) => f.id);

      if (modifiedFileIds.length > 0) {
        await this.chunkStorage.deleteByIndexedFileIds(modifiedFileIds);
        console.log(`[Indexer] cleared chunks for ${modifiedFileIds.length} modified files`);
      }
    }

    // 3. Сохраняем file blobs (дедупликация через ON CONFLICT DO NOTHING).
    const blobsToInsert = changedFiles.map((f) => ({
      contentHash: f.contentHash,
      content: f.content,
      byteSize: Buffer.byteLength(f.content, 'utf-8'),
    }));
    await this.fileBlobStorage.upsertMany(blobsToInsert);
    this.progress.onBlobDedup?.(0, blobsToInsert.length);

    // 4. Upsert indexed_files.
    const indexedFileUpserts = changedFiles.map((f) => ({
      path: f.path,
      contentHash: f.contentHash,
    }));
    const upsertedFiles = await this.indexedFileStorage.upsertMany(view.id, indexedFileUpserts);
    const fileIdMap = new Map(upsertedFiles.map((f) => [f.path, f.id]));

    // 5. Чанкинг изменённых файлов.
    const allChunks = [];
    for (const file of changedFiles) {
      const fileContent: FileContent = {
        path: file.path,
        content: file.content,
        sourceId: view.source_id,
      };
      const chunks = this.dispatcher.chunk(fileContent);
      allChunks.push(...chunks);
    }
    this.progress.onChunkComplete(allChunks.length, changedFiles.length);

    // 6. Вставляем chunk_contents (дедупликация через ON CONFLICT DO NOTHING).
    const uniqueContents = new Map<string, string>();
    for (const chunk of allChunks) {
      if (!uniqueContents.has(chunk.contentHash)) {
        uniqueContents.set(chunk.contentHash, chunk.content);
      }
    }
    const contentInserts = [...uniqueContents.entries()].map(([contentHash, content]) => ({
      contentHash,
      content,
    }));
    await this.chunkContentStorage.insertBatch(contentInserts);
    this.progress.onContentDedup?.(0, contentInserts.length);

    // 7. Вставляем chunk occurrences (per-file ordinal).
    const occurrencesByFile = new Map<string, typeof allChunks>();
    for (const chunk of allChunks) {
      const path = chunk.metadata.path;
      if (!occurrencesByFile.has(path)) {
        occurrencesByFile.set(path, []);
      }
      occurrencesByFile.get(path)!.push(chunk);
    }

    const allOccurrences: ChunkOccurrenceInsert[] = [];
    for (const [path, chunks] of occurrencesByFile) {
      const indexedFileId = fileIdMap.get(path);
      if (!indexedFileId) {
        console.error(`[Indexer] ERROR: indexed_file not found for path: ${path}`);
        continue;
      }
      for (let ordinal = 0; ordinal < chunks.length; ordinal++) {
        const chunk = chunks[ordinal]!;
        const metadata = buildChunkMetadataJson(chunk.metadata);
        allOccurrences.push({
          sourceViewId: view.id,
          indexedFileId,
          chunkContentHash: chunk.contentHash,
          path: chunk.metadata.path,
          sourceType: chunk.metadata.sourceType,
          startLine: chunk.metadata.startLine,
          endLine: chunk.metadata.endLine,
          headerPath: chunk.metadata.headerPath,
          language: chunk.metadata.language,
          ordinal,
          metadata,
        });
      }
    }

    if (allOccurrences.length > 0) {
      await this.chunkStorage.insertBatch(allOccurrences);
    }
    this.progress.onStoreComplete();

    // 7.5 Repair: восстанавливаем chunks для indexed_files без ассоциированных chunks.
    // Покрывает сценарий "broken baseline": diff-scan не пересоздаёт chunks для неизменённых файлов,
    // если предыдущая индексация завершилась до chunk-фазы.
    let repairedFiles = 0;
    const chunklessFiles = await this.indexedFileStorage.getChunklessFiles(view.id);

    if (chunklessFiles.length > 0) {
      console.log(
        `[Indexer.indexView] Repairing ${chunklessFiles.length} indexed files without chunks`,
      );

      const repairContentMap = new Map<string, string>();
      const repairOccurrences: ChunkOccurrenceInsert[] = [];

      for (const chunklessFile of chunklessFiles) {
        try {
          const blob = await this.fileBlobStorage.getByHash(chunklessFile.content_hash);

          // Orphan indexed_file без blob — пропускаем, repair продолжается для остальных.
          if (!blob) {
            console.warn(
              `[Indexer.indexView] Repair skipped ${chunklessFile.path}: ` +
              `blob not found for content_hash=${chunklessFile.content_hash}`,
            );
            continue;
          }

          const fileContent: FileContent = {
            path: chunklessFile.path,
            content: blob.content,
            sourceId: view.source_id,
          };
          const repairChunks = this.dispatcher.chunk(fileContent);

          if (repairChunks.length === 0) {
            // Файл отфильтрован chunker'ом (пустой, слишком короткий) — repair невозможен.
            continue;
          }

          for (let ordinal = 0; ordinal < repairChunks.length; ordinal++) {
            const chunk = repairChunks[ordinal]!;
            if (!repairContentMap.has(chunk.contentHash)) {
              repairContentMap.set(chunk.contentHash, chunk.content);
            }
            const metadata = buildChunkMetadataJson(chunk.metadata);
            repairOccurrences.push({
              sourceViewId: view.id,
              indexedFileId: chunklessFile.id,
              chunkContentHash: chunk.contentHash,
              path: chunk.metadata.path,
              sourceType: chunk.metadata.sourceType,
              startLine: chunk.metadata.startLine,
              endLine: chunk.metadata.endLine,
              headerPath: chunk.metadata.headerPath,
              language: chunk.metadata.language,
              ordinal,
              metadata,
            });
          }

          repairedFiles++;
          console.log(
            `[Indexer.indexView] Repaired file: ${chunklessFile.path} -> ${repairChunks.length} chunks`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Indexer.indexView] Repair failed for ${chunklessFile.path}: ${msg}`);
        }
      }

      const repairContentInserts: ChunkContentInsert[] = [...repairContentMap.entries()].map(
        ([contentHash, content]) => ({ contentHash, content }),
      );

      // Порядок критичен: сначала chunk_contents (иначе getByHashes на шаге 8 не найдёт строк),
      // затем chunk occurrences.
      if (repairContentInserts.length > 0) {
        await this.chunkContentStorage.insertBatch(repairContentInserts);
      }
      if (repairOccurrences.length > 0) {
        await this.chunkStorage.insertBatch(repairOccurrences);
      }

      // Добавляем repair content hashes в contentInserts для единого embedding-прохода.
      contentInserts.push(...repairContentInserts);

      console.log(
        `[Indexer.indexView] Repair summary: ${repairedFiles}/${chunklessFiles.length} files restored, ` +
        `${repairOccurrences.length} chunk occurrences, ${repairContentInserts.length} new contents`,
      );
    }

    // 8. Генерируем embeddings для новых chunk_contents.
    let embeddingsDeferred = 0;
    if (contentInserts.length > 0) {
      // Определяем content_hash-и без embedding. Падения здесь (transient DB)
      // покрываются внешним try/catch ниже — это отдельная от per-batch isolation стадия.
      try {
        const existing = await this.chunkContentStorage.getByHashes(
          contentInserts.map((c) => c.contentHash),
        );
        const needEmbedding = existing
          .filter((c) => c.embedding === null)
          .map((c) => c.content_hash);

        if (needEmbedding.length > 0) {
          const hashToContent = new Map(contentInserts.map((c) => [c.contentHash, c.content]));
          const textsToEmbed = needEmbedding.map((h) => hashToContent.get(h)!);

          // Разбиваем на батчи с параллельными массивами texts/hashes, чтобы
          // связать результат batch с соответствующими content_hash без пересборки.
          const batches: Array<{ texts: string[]; hashes: string[]; index: number }> = [];
          for (let i = 0; i < textsToEmbed.length; i += EMBED_BATCH_SIZE) {
            batches.push({
              texts: textsToEmbed.slice(i, i + EMBED_BATCH_SIZE),
              hashes: needEmbedding.slice(i, i + EMBED_BATCH_SIZE),
              index: batches.length,
            });
          }

          let completedCount = 0;
          let failedBatchCount = 0;
          const totalBatches = batches.length;

          // Per-batch isolation: один упавший batch не обрушивает весь embedding phase.
          // Retry покрывает только non-transport ошибки (JSON/структурная валидация,
          // !response.ok branch) — network/5xx/429 уже ретраятся внутри fetchWithRetry
          // в провайдере, повторный retry здесь удвоил бы нагрузку.
          const batchResults = await pMap(
            batches,
            async (batch) => {
              try {
                const embeddings = await this.embedder.embedBatch(batch.texts);
                completedCount += batch.texts.length;
                this.progress.onEmbedProgress(completedCount, needEmbedding.length);
                const durationMs = 0;
                console.log(
                  `[Indexer.indexView] Batch ${batch.index + 1}/${totalBatches} completed: ` +
                  `${batch.texts.length} embeddings in ${durationMs}ms`,
                );
                return { hashes: batch.hashes, embeddings };
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(
                  `[Indexer.indexView] Embedding batch ${batch.index + 1}/${totalBatches} ` +
                  `failed (bypasses fetchWithRetry): ${msg}, retrying once...`,
                );
                try {
                  const embeddings = await this.embedder.embedBatch(batch.texts);
                  completedCount += batch.texts.length;
                  this.progress.onEmbedProgress(completedCount, needEmbedding.length);
                  return { hashes: batch.hashes, embeddings };
                } catch (retryErr) {
                  const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                  console.warn(
                    `[Indexer.indexView] Embedding batch ${batch.index + 1}/${totalBatches} ` +
                    `retry failed: ${retryMsg}, ${batch.texts.length} deferred`,
                  );
                  // Прогресс инкрементируется и в fail-пути, чтобы UI не застрял.
                  completedCount += batch.texts.length;
                  this.progress.onEmbedProgress(completedCount, needEmbedding.length);
                  failedBatchCount++;
                  return null;
                }
              }
            },
            EMBED_CONCURRENCY,
          );

          // Собираем только успешные batches.
          const updates: Array<{ contentHash: string; embedding: number[] }> = [];
          for (const batchResult of batchResults) {
            if (batchResult === null) continue;
            for (let i = 0; i < batchResult.hashes.length; i++) {
              updates.push({
                contentHash: batchResult.hashes[i]!,
                embedding: batchResult.embeddings[i]!,
              });
            }
          }

          embeddingsDeferred = needEmbedding.length - updates.length;

          if (updates.length > 0) {
            await this.chunkContentStorage.updateEmbeddings(updates);
          }

          console.log(
            `[Indexer.indexView] Embeddings: ${updates.length}/${needEmbedding.length} succeeded, ` +
            `${embeddingsDeferred} deferred (${failedBatchCount}/${totalBatches} batches failed)`,
          );
        }
      } catch (err) {
        // Покрывает только getByHashes / updateEmbeddings — embedBatch изолирован выше.
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Indexer] embedding phase failed, all deferred: ${msg}`);
        embeddingsDeferred = contentInserts.length;
      }
    }

    // 9. Подсчёт итогов.
    const totalChunks = await this.chunkStorage.countByView(view.id);
    const totalFileCount = context?.totalFileCount ?? changedFiles.length;
    const unchangedFileCount = context?.unchangedFileCount ?? 0;

    const result: IndexResult = {
      totalFiles: totalFileCount,
      totalChunks,
      newChunks: allChunks.length,
      deletedFiles: deletedPaths.length,
      unchangedFiles: unchangedFileCount,
      duration: Date.now() - startTime,
      newBlobCount: blobsToInsert.length,
      reusedBlobCount: 0,
      newChunkContentCount: contentInserts.length,
      reusedChunkContentCount: 0,
      embeddingsDeferred,
      strategy: context?.strategy ?? 'unknown',
      repairedFiles,
    };

    this.progress.onComplete(result);
    return result;
  }

  // --- Legacy API (deprecated). ---

  /**
   * @deprecated Используйте indexView. Сохранён для обратной совместимости.
   */
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

    // 4. Генерируем эмбеддинги батчами.
    let embeddings: number[][] = [];
    if (allChunks.length > 0) {
      const batches: typeof allChunks[] = [];
      for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
        batches.push(allChunks.slice(i, i + EMBED_BATCH_SIZE));
      }

      let completedChunks = 0;
      const batchResults = await pMap(
        batches,
        async (batch) => {
          const texts = batch.map((c) => c.content);
          const batchEmbeddings = await this.embedder.embedBatch(texts);
          completedChunks += batch.length;
          this.progress.onEmbedProgress(completedChunks, allChunks.length);
          return batchEmbeddings;
        },
        EMBED_CONCURRENCY,
      );

      embeddings = batchResults.flat();
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

    // 7. Получаем точное количество чанков.
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
