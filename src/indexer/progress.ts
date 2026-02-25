// Репортер прогресса индексации.

// Результат индексации источника.
export interface IndexResult {
  totalFiles: number;
  totalChunks: number;
  newChunks: number;
  duration: number;
}

// Интерфейс репортера прогресса.
export interface ProgressReporter {
  onScanComplete(fileCount: number, excludedCount: number): void;
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
