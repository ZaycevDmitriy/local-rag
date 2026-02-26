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
}

// Интерфейс репортера прогресса.
export interface ProgressReporter {
  onScanComplete(fileCount: number, excludedCount: number): void;
  onChangesDetected(changes: ChangeDetectionResult): void;
  onChunkComplete(chunkCount: number, fileCount: number): void;
  onEmbedProgress(current: number, total: number): void;
  onStoreComplete(): void;
  onComplete(result: IndexResult): void;
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
    console.log(
      `  Готово: ${result.totalFiles} файлов, ${result.totalChunks} фрагментов за ${seconds}с`,
    );
  }
}
