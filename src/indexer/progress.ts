// Репортер прогресса индексации.
import type { ChangeDetectionResult } from './incremental.js';

// Результат индексации источника.
export interface IndexResult {
  totalFiles: number;
  totalChunks: number;
  newChunks: number;
  deletedFiles: number;
  unchangedFiles: number;
  duration: number;
  // Branch-aware поля (Task 5).
  reusedBlobCount?: number;
  newBlobCount?: number;
  reusedChunkContentCount?: number;
  newChunkContentCount?: number;
  embeddingsDeferred?: number;
  strategy?: string;
}

// Интерфейс репортера прогресса.
export interface ProgressReporter {
  onScanComplete(fileCount: number, excludedCount: number): void;
  onChangesDetected(changes: ChangeDetectionResult): void;
  onChunkComplete(chunkCount: number, fileCount: number): void;
  onEmbedProgress(current: number, total: number): void;
  onStoreComplete(): void;
  onComplete(result: IndexResult): void;
  // Branch-aware callbacks (Task 5).
  onBlobDedup?(reused: number, total: number): void;
  onContentDedup?(reused: number, total: number): void;
}

// Вывод прогресса в консоль.
export class ConsoleProgress implements ProgressReporter {
  onScanComplete(fileCount: number, excludedCount: number): void {
    console.log(`  Сканирование: ${fileCount} файлов найдено (${excludedCount} исключено)`);
  }

  onChangesDetected(changes: ChangeDetectionResult): void {
    const newCount = changes.changed.filter((c) => c.status === 'added').length;
    const modifiedCount = changes.changed.filter((c) => c.status === 'modified').length;
    console.log(
      `  Изменения: ${newCount} новых, ${modifiedCount} изменённых, ` +
      `${changes.deleted.length} удалённых (${changes.unchanged} без изменений)`,
    );
  }

  onChunkComplete(chunkCount: number, fileCount: number): void {
    console.log(`  Чанкинг: ${chunkCount} фрагментов из ${fileCount} файлов`);
  }

  onEmbedProgress(current: number, total: number): void {
    console.log(`  Эмбеддинги: ${current}/${total}`);
  }

  onStoreComplete(): void {
    console.log('  Сохранение в БД: завершено');
  }

  onComplete(result: IndexResult): void {
    const seconds = (result.duration / 1000).toFixed(1);
    const strategyStr = result.strategy ? ` [${result.strategy}]` : '';
    console.log(
      `  Готово: ${result.totalFiles} файлов, ${result.totalChunks} фрагментов за ${seconds}с${strategyStr}`,
    );

    if (result.reusedBlobCount !== undefined) {
      console.log(
        `  Дедупликация: blobs=${result.reusedBlobCount} reused/${result.newBlobCount ?? 0} new, ` +
        `contents=${result.reusedChunkContentCount ?? 0} reused/${result.newChunkContentCount ?? 0} new`,
      );
    }

    if (result.embeddingsDeferred && result.embeddingsDeferred > 0) {
      console.log(`  Эмбеддинги отложены: ${result.embeddingsDeferred} (rag re-embed для восстановления)`);
    }
  }

  onBlobDedup(reused: number, total: number): void {
    console.log(`  File blobs: ${reused} reused / ${total} total`);
  }

  onContentDedup(reused: number, total: number): void {
    console.log(`  Chunk contents: ${reused} reused / ${total} total`);
  }
}
