// Фильтрация файлов по .gitignore, .ragignore и встроенным правилам.
import ignore from 'ignore';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

type Ignore = ReturnType<typeof ignore>;

// Паттерны, исключаемые всегда (в формате .gitignore).
const BUILTIN_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '*.lock',
  'package-lock.json',
];

// Расширения бинарных файлов.
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov',
]);

// Фильтр файлов: встроенные правила + .gitignore + .ragignore + конфиг exclude.
export class FileFilter {
  private readonly builtinIg: Ignore;
  private gitignoreIg: Ignore | null = null;
  private ragignoreIg: Ignore | null = null;
  private configIg: Ignore | null = null;

  constructor(
    private readonly basePath: string,
    private readonly configExclude?: string[],
  ) {
    this.builtinIg = ignore();
    this.builtinIg.add(BUILTIN_PATTERNS);
  }

  // Загружает .gitignore и .ragignore из basePath.
  async init(): Promise<void> {
    const gitignoreContent = await tryReadFile(join(this.basePath, '.gitignore'));
    if (gitignoreContent !== null) {
      this.gitignoreIg = ignore();
      this.gitignoreIg.add(gitignoreContent);
    }

    const ragignoreContent = await tryReadFile(join(this.basePath, '.ragignore'));
    if (ragignoreContent !== null) {
      this.ragignoreIg = ignore();
      this.ragignoreIg.add(ragignoreContent);
    }

    if (this.configExclude && this.configExclude.length > 0) {
      this.configIg = ignore();
      this.configIg.add(this.configExclude);
    }
  }

  // Возвращает true, если файл должен быть включён в индексацию.
  shouldInclude(relativePath: string): boolean {
    // Нормализуем разделители к Unix-стилю.
    const normalized = relativePath.replace(/\\/g, '/');

    // 1. Встроенные исключения.
    if (this.builtinIg.ignores(normalized)) {
      return false;
    }

    // 2. Бинарные расширения.
    const ext = extname(normalized).toLowerCase();
    if (ext && BINARY_EXTENSIONS.has(ext)) {
      return false;
    }

    // 3. .gitignore паттерны.
    if (this.gitignoreIg !== null && this.gitignoreIg.ignores(normalized)) {
      return false;
    }

    // 4. .ragignore паттерны.
    if (this.ragignoreIg !== null && this.ragignoreIg.ignores(normalized)) {
      return false;
    }

    // 5. Конфиг exclude паттерны.
    if (this.configIg !== null && this.configIg.ignores(normalized)) {
      return false;
    }

    return true;
  }
}

// Читает файл, возвращает null если не существует или недоступен.
async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}
