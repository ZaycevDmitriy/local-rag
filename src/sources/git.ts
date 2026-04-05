import { execFile as execFileCb } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

// Результат resolveRepoContext.
export interface RepoContext {
  repoRoot: string;
  repoSubpath: string | null;
}

// Результат getCurrentRef.
export interface CurrentRef {
  viewKind: 'branch' | 'detached';
  refName: string;
}

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

// --- Локальный git-анализ (branch-aware indexing). ---

// Безопасный вызов git-команды с логированием.
async function gitExec(repoRoot: string, args: string[]): Promise<string> {
  console.log(`[git] exec: git -C ${repoRoot} ${args.join(' ')}`);

  try {
    const { stdout } = await execFile('git', ['-C', repoRoot, ...args]);
    return stdout.trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[git] ERROR: git -C ${repoRoot} ${args.join(' ')}: ${message}`);
    throw error;
  }
}

// 1. Определяет root git-репозитория и subpath относительно него.
export async function resolveRepoContext(path: string): Promise<RepoContext> {
  console.log(`[git] resolveRepoContext: path=${path}`);

  const absPath = resolve(path);

  try {
    const repoRoot = (await execFile('git', ['-C', absPath, 'rev-parse', '--show-toplevel'])).stdout.trimEnd();

    const repoSubpath = relative(repoRoot, absPath) || null;

    console.log(`[git] resolveRepoContext: repoRoot=${repoRoot}, subpath=${repoSubpath}`);

    return { repoRoot, repoSubpath };
  } catch {
    console.log(`[git] resolveRepoContext: ${absPath} не является git-репозиторием`);
    return { repoRoot: absPath, repoSubpath: null };
  }
}

// 2. Определяет текущий ref (branch/detached) и имя.
export async function getCurrentRef(repoRoot: string): Promise<CurrentRef> {
  try {
    const refName = await gitExec(repoRoot, ['symbolic-ref', '--short', 'HEAD']);

    return { viewKind: 'branch', refName };
  } catch {
    // Detached HEAD.
    const oid = await gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);

    return { viewKind: 'detached', refName: `HEAD@${oid}` };
  }
}

// 3. Список локальных веток.
export async function listLocalBranches(repoRoot: string): Promise<string[]> {
  const output = await gitExec(repoRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);

  if (!output) return [];

  return output.split('\n').filter(Boolean);
}

// 4. OID текущего HEAD commit.
export async function getHeadCommit(repoRoot: string): Promise<string> {
  return gitExec(repoRoot, ['rev-parse', 'HEAD']);
}

// 5. OID корневого tree текущего HEAD.
export async function getHeadTree(repoRoot: string): Promise<string> {
  return gitExec(repoRoot, ['rev-parse', 'HEAD^{tree}']);
}

// 6. OID поддерева для subpath. Null если subpath не существует.
export async function getSubtreeOid(repoRoot: string, subpath: string): Promise<string | null> {
  try {
    return await gitExec(repoRoot, ['rev-parse', `HEAD:${subpath}`]);
  } catch {
    console.log(`[git] getSubtreeOid: subpath=${subpath} не найден`);
    return null;
  }
}

// 7. Проверяет dirty state рабочей директории.
export async function isDirtyWorktree(repoRoot: string): Promise<boolean> {
  const output = await gitExec(repoRoot, ['status', '--porcelain']);

  return output.length > 0;
}

// 8. Список файлов из committed diff между двумя OID.
export async function getCommittedDiffPaths(
  repoRoot: string,
  fromOid: string,
  toOid: string,
  repoSubpath?: string,
): Promise<string[]> {
  const args = ['diff', '--name-only', fromOid, toOid];

  if (repoSubpath) {
    args.push('--', repoSubpath);
  }

  const output = await gitExec(repoRoot, args);

  if (!output) return [];

  const paths = output.split('\n').filter(Boolean);

  // Если есть subpath, пути уже относительные к repoRoot; нужно обрезать subpath prefix.
  if (repoSubpath) {
    const prefix = repoSubpath.endsWith('/') ? repoSubpath : repoSubpath + '/';
    return paths
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
  }

  return paths;
}

// 9. Tracked dirty файлы (изменённые, но не в committed diff).
export async function getTrackedWorktreeChanges(
  repoRoot: string,
  repoSubpath?: string,
): Promise<string[]> {
  const args = ['diff-index', '--name-only', 'HEAD'];

  if (repoSubpath) {
    args.push('--', repoSubpath);
  }

  const output = await gitExec(repoRoot, args);

  if (!output) return [];

  const paths = output.split('\n').filter(Boolean);

  if (repoSubpath) {
    const prefix = repoSubpath.endsWith('/') ? repoSubpath : repoSubpath + '/';
    return paths
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
  }

  return paths;
}

// 10. Untracked файлы.
export async function getUntrackedFiles(
  repoRoot: string,
  repoSubpath?: string,
): Promise<string[]> {
  const args = ['ls-files', '--others', '--exclude-standard'];

  if (repoSubpath) {
    args.push('--', repoSubpath);
  }

  const output = await gitExec(repoRoot, args);

  if (!output) return [];

  const paths = output.split('\n').filter(Boolean);

  if (repoSubpath) {
    const prefix = repoSubpath.endsWith('/') ? repoSubpath : repoSubpath + '/';
    return paths
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
  }

  return paths;
}

// 11. Проверяет, является ли maybeAncestor предком maybeDescendant.
export async function isAncestor(
  repoRoot: string,
  maybeAncestor: string,
  maybeDescendant: string,
): Promise<boolean> {
  try {
    await gitExec(repoRoot, ['merge-base', '--is-ancestor', maybeAncestor, maybeDescendant]);
    return true;
  } catch {
    return false;
  }
}
