import { execFile as execFileCb } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

// Результат клонирования/обновления репозитория.
export interface GitCloneResult {
  // Локальный путь к директории репозитория.
  localPath: string;
}

// Разворачивает ~ в начале пути в домашнюю директорию.
export function expandHome(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace(/^~/, homedir());
  }
  return path;
}

// Извлекает имя репозитория из URL.
// Поддерживает HTTPS (https://github.com/user/repo.git) и SSH (git@github.com:user/repo.git).
export function extractRepoName(url: string): string {
  // Убираем .git суффикс.
  const withoutGit = url.replace(/\.git$/, '');
  // Берём последний сегмент пути.
  const segments = withoutGit.split(/[/:]/).filter(Boolean);
  return segments[segments.length - 1] ?? 'repo';
}

// Проверяет, является ли директория существующим git-репозиторием.
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await access(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Клонирует репозиторий или обновляет существующий.
 *
 * - Новый репо: git clone --depth 1 --branch <branch> <url> <path>
 * - Существующий: git pull --ff-only
 *
 * Использует execFile (не exec) для защиты от shell injection.
 */
export async function cloneOrPull(
  url: string,
  branch: string,
  cloneDir: string,
): Promise<GitCloneResult> {
  const resolvedCloneDir = expandHome(cloneDir);
  const repoName = extractRepoName(url);
  const localPath = join(resolvedCloneDir, repoName);

  // Создаём директорию для клонов, если не существует.
  await mkdir(resolvedCloneDir, { recursive: true });

  if (await isGitRepo(localPath)) {
    // Обновляем существующий репозиторий.
    await execFile('git', ['-C', localPath, 'pull', '--ff-only']);
  } else {
    // Клонируем новый репозиторий.
    await execFile('git', [
      'clone',
      '--depth', '1',
      '--branch', branch,
      url,
      localPath,
    ]);
  }

  return { localPath };
}
