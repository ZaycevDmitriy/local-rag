// Сканирование локальных файлов для индексации.
import fg from 'fast-glob';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { FileFilter } from './file-filter.js';

// Результат сканирования одного файла.
export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

// Результат сканирования директории.
export interface ScanResult {
  files: ScannedFile[];
  excludedCount: number;
}

// Максимальный размер файла для индексации (1 МБ).
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Сканирует локальную директорию и возвращает список файлов с содержимым.
 *
 * Алгоритм:
 * 1. fast-glob сканирует basePath с include-паттернами (по умолчанию **\/*).
 * 2. FileFilter применяет .gitignore, .ragignore, встроенные и конфиг exclude.
 * 3. Пропускает файлы > 1 МБ.
 * 4. Читает содержимое каждого файла.
 */
export async function scanLocalFiles(
  basePath: string,
  options?: { include?: string[]; exclude?: string[] },
): Promise<ScanResult> {
  const resolvedBase = resolve(basePath);
  const includePatterns = options?.include ?? ['**/*'];

  // fast-glob: минимальный ignore для производительности.
  const paths = await fg(includePatterns, {
    cwd: resolvedBase,
    ignore: ['**/node_modules/**', '**/.git/**'],
    dot: false,
    onlyFiles: true,
    absolute: false,
  });

  // Создаём FileFilter и загружаем .gitignore/.ragignore.
  const filter = new FileFilter(resolvedBase, options?.exclude);
  await filter.init();

  const files: ScannedFile[] = [];
  let excludedCount = 0;

  for (const relPath of paths) {
    // Применяем FileFilter.
    if (!filter.shouldInclude(relPath)) {
      excludedCount++;
      continue;
    }

    const absPath = resolve(resolvedBase, relPath);

    // Проверяем размер файла.
    try {
      const fileStat = await stat(absPath);
      if (fileStat.size > MAX_FILE_SIZE) {
        excludedCount++;
        continue;
      }
    } catch {
      // Файл недоступен — пропускаем.
      continue;
    }

    // Читаем содержимое.
    try {
      const content = await readFile(absPath, 'utf-8');
      files.push({
        absolutePath: absPath,
        relativePath: relative(resolvedBase, absPath),
        content,
      });
    } catch {
      // Ошибка чтения — пропускаем.
      continue;
    }
  }

  return { files, excludedCount };
}
