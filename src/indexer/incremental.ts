// Обнаружение изменённых файлов для инкрементальной индексации.
import { createHash } from 'node:crypto';
import type { IndexedFileStorage } from '../storage/indexed-files.js';
import type { ScannedFile } from '../sources/local.js';

// Описание изменённого файла.
export interface FileChange {
  path: string;
  absolutePath: string;
  content: string;
  hash: string;
  status: 'added' | 'modified';
}

// Результат обнаружения изменений.
export interface ChangeDetectionResult {
  changed: FileChange[];
  unchanged: number;
  deleted: string[];
}

// Вычисляет SHA-256 хэш строки.
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// Сравнивает текущие файлы с сохранёнными хэшами для определения изменений.
export async function detectChanges(
  sourceId: string,
  files: ScannedFile[],
  storage: IndexedFileStorage,
): Promise<ChangeDetectionResult> {
  // Загружаем сохранённые хэши для источника.
  const indexed = await storage.getBySource(sourceId);
  const indexedMap = new Map(indexed.map((row) => [row.path, row.file_hash]));

  const changed: FileChange[] = [];
  let unchanged = 0;
  const currentPaths = new Set<string>();

  for (const file of files) {
    const hash = sha256(file.content);
    currentPaths.add(file.relativePath);

    const savedHash = indexedMap.get(file.relativePath);

    if (savedHash === undefined) {
      // Файл появился впервые.
      changed.push({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        content: file.content,
        hash,
        status: 'added',
      });
    } else if (savedHash !== hash) {
      // Файл изменился.
      changed.push({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        content: file.content,
        hash,
        status: 'modified',
      });
    } else {
      // Файл не изменился.
      unchanged++;
    }
  }

  // Файлы, которые были в индексе, но исчезли из источника.
  const deleted: string[] = [];
  for (const [path] of indexedMap) {
    if (!currentPaths.has(path)) {
      deleted.push(path);
    }
  }

  return { changed, unchanged, deleted };
}
