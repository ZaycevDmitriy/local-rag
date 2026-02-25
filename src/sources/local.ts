// Сканирование локальных файлов для индексации.
import fg from 'fast-glob';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// Результат сканирования одного файла.
export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

// Максимальный размер файла для индексации (1 МБ).
const MAX_FILE_SIZE = 1024 * 1024;

// Паттерны, исключаемые всегда.
const BUILTIN_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
  '**/__pycache__/**',
];

// Расширения бинарных файлов.
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4',
  '.zip', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib',
]);

// Проверяет, является ли файл бинарным по расширению.
function isBinaryFile(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) {
    return false;
  }
  const ext = filePath.slice(dotIndex).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Сканирует локальную директорию и возвращает список файлов с содержимым.
 *
 * Алгоритм:
 * 1. fast-glob сканирует basePath с include-паттернами (по умолчанию **\/*).
 * 2. Применяет exclude-паттерны (встроенные + пользовательские).
 * 3. Пропускает бинарные файлы и файлы > 1 МБ.
 * 4. Читает содержимое каждого файла.
 */
export async function scanLocalFiles(
  basePath: string,
  options?: { include?: string[]; exclude?: string[] },
): Promise<ScannedFile[]> {
  const resolvedBase = resolve(basePath);
  const includePatterns = options?.include ?? ['**/*'];
  const excludePatterns = [
    ...BUILTIN_EXCLUDES,
    ...(options?.exclude ?? []),
  ];

  // Получаем список файлов через fast-glob.
  const paths = await fg(includePatterns, {
    cwd: resolvedBase,
    ignore: excludePatterns,
    dot: false,
    onlyFiles: true,
    absolute: false,
  });

  const files: ScannedFile[] = [];

  for (const relPath of paths) {
    const absPath = resolve(resolvedBase, relPath);

    // Пропускаем бинарные файлы.
    if (isBinaryFile(relPath)) {
      continue;
    }

    // Проверяем размер файла.
    try {
      const fileStat = await stat(absPath);
      if (fileStat.size > MAX_FILE_SIZE) {
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

  return files;
}
