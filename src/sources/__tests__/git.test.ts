import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Мокируем node:child_process и node:fs/promises.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
}));

// Импортируем после мока.
import {
  cloneOrPull,
  expandHome,
  extractRepoName,
  getCurrentRef,
  listLocalBranches,
  getHeadCommit,
  getHeadTree,
  getSubtreeOid,
  isDirtyWorktree,
  isAncestor,
} from '../git.js';
import * as childProcess from 'node:child_process';
import * as fsp from 'node:fs/promises';

// Тип для мокированного execFile.
const mockExecFile = childProcess.execFile as unknown as ReturnType<typeof vi.fn>;
const mockAccess = fsp.access as unknown as ReturnType<typeof vi.fn>;
const mockMkdir = fsp.mkdir as unknown as ReturnType<typeof vi.fn>;

describe('extractRepoName', () => {
  it('извлекает имя из HTTPS URL', () => {
    expect(extractRepoName('https://github.com/user/repo.git')).toBe('repo');
  });

  it('извлекает имя из HTTPS URL без .git', () => {
    expect(extractRepoName('https://github.com/user/my-project')).toBe('my-project');
  });

  it('извлекает имя из SSH URL', () => {
    expect(extractRepoName('git@github.com:user/repo.git')).toBe('repo');
  });

  it('извлекает имя из SSH URL без .git', () => {
    expect(extractRepoName('git@github.com:user/local-rag')).toBe('local-rag');
  });
});

describe('expandHome', () => {
  it('разворачивает ~/ в домашнюю директорию', () => {
    expect(expandHome('~/repos')).toBe(join(homedir(), 'repos'));
  });

  it('разворачивает ~ в домашнюю директорию', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('не меняет абсолютный путь', () => {
    expect(expandHome('/usr/local/repos')).toBe('/usr/local/repos');
  });
});

describe('cloneOrPull', () => {
  const cloneDir = '/tmp/rag-repos';
  const url = 'https://github.com/user/repo.git';
  const branch = 'main';

  beforeEach(() => {
    vi.resetAllMocks();
    mockMkdir.mockResolvedValue(undefined);
  });

  it('клонирует новый репозиторий (git clone)', async () => {
    // .git не найден — новый репо.
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: '', stderr: '' });
    });

    const result = await cloneOrPull(url, branch, cloneDir);

    // Проверяем вызов git clone.
    const calls = mockExecFile.mock.calls;
    const cloneCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('clone'));
    expect(cloneCall).toBeDefined();
    const args = cloneCall![1] as string[];
    expect(args).toContain('clone');
    expect(args).toContain('--depth');
    expect(args).toContain('1');
    expect(args).toContain('--branch');
    expect(args).toContain(branch);
    expect(args).toContain(url);

    expect(result.localPath).toBe(join(cloneDir, 'repo'));
  });

  it('обновляет существующий репозиторий (git pull)', async () => {
    // .git найден — существующий репо.
    mockAccess.mockResolvedValue(undefined);
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: 'Already up to date.', stderr: '' });
    });

    const result = await cloneOrPull(url, branch, cloneDir);

    const calls = mockExecFile.mock.calls;
    const pullCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('pull'));
    expect(pullCall).toBeDefined();
    const args = pullCall![1] as string[];
    expect(args).toContain('pull');
    expect(args).toContain('--ff-only');

    expect(result.localPath).toBe(join(cloneDir, 'repo'));
  });

  it('корректный localPath для HTTPS URL', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: '', stderr: '' });
    });

    const result = await cloneOrPull('https://github.com/user/my-lib.git', 'main', '/tmp/repos');

    expect(result.localPath).toBe('/tmp/repos/my-lib');
  });

  it('корректный localPath для SSH URL', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: '', stderr: '' });
    });

    const result = await cloneOrPull('git@github.com:user/ssh-repo.git', 'develop', '/tmp/repos');

    expect(result.localPath).toBe('/tmp/repos/ssh-repo');
  });

  it('создаёт cloneDir если не существует', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: '', stderr: '' });
    });

    await cloneOrPull(url, branch, '/tmp/new-dir');

    expect(mockMkdir).toHaveBeenCalledWith('/tmp/new-dir', { recursive: true });
  });

  it('ошибка git -> пробрасывает исключение', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
      callback(new Error('git: not found'));
    });

    await expect(cloneOrPull(url, branch, cloneDir)).rejects.toThrow('git: not found');
  });
});

// --- Тесты для branch-aware git-методов. ---

// Хелпер: мокирует execFile с callback-стилем для promisify.
function mockGitOutput(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout, stderr: '' });
    },
  );
}

function mockGitError(message: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], callback: (err: Error) => void) => {
      callback(new Error(message));
    },
  );
}

describe('getCurrentRef', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает branch при symbolic ref', async () => {
    mockGitOutput('main\n');

    const result = await getCurrentRef('/repo');

    expect(result).toEqual({ viewKind: 'branch', refName: 'main' });
  });

  it('возвращает detached при отсутствии symbolic ref', async () => {
    // Первый вызов (symbolic-ref) — ошибка.
    mockExecFile
      .mockImplementationOnce((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not a symbolic ref'));
      })
      .mockImplementationOnce((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
        callback(null, { stdout: 'abc1234\n', stderr: '' });
      });

    const result = await getCurrentRef('/repo');

    expect(result).toEqual({ viewKind: 'detached', refName: 'HEAD@abc1234' });
  });
});

describe('listLocalBranches', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает список веток', async () => {
    mockGitOutput('main\nfeature/foo\ndevelop\n');

    const result = await listLocalBranches('/repo');

    expect(result).toEqual(['main', 'feature/foo', 'develop']);
  });

  it('возвращает пустой массив при пустом выводе', async () => {
    mockGitOutput('');

    const result = await listLocalBranches('/repo');

    expect(result).toEqual([]);
  });
});

describe('getHeadCommit', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает OID HEAD commit', async () => {
    mockGitOutput('abc123def456789\n');

    const result = await getHeadCommit('/repo');

    expect(result).toBe('abc123def456789');
  });
});

describe('getHeadTree', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает OID HEAD tree', async () => {
    mockGitOutput('tree789abc\n');

    const result = await getHeadTree('/repo');

    expect(result).toBe('tree789abc');
  });
});

describe('getSubtreeOid', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает OID поддерева', async () => {
    mockGitOutput('subtree123\n');

    const result = await getSubtreeOid('/repo', 'src/app');

    expect(result).toBe('subtree123');
  });

  it('возвращает null если subpath не найден', async () => {
    mockGitError('fatal: not valid object name');

    const result = await getSubtreeOid('/repo', 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('isDirtyWorktree', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает true при dirty worktree', async () => {
    mockGitOutput(' M src/file.ts\n');

    const result = await isDirtyWorktree('/repo');

    expect(result).toBe(true);
  });

  it('возвращает false при clean worktree', async () => {
    mockGitOutput('');

    const result = await isDirtyWorktree('/repo');

    expect(result).toBe(false);
  });
});

describe('isAncestor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('возвращает true если является предком', async () => {
    mockGitOutput('');

    const result = await isAncestor('/repo', 'abc', 'def');

    expect(result).toBe(true);
  });

  it('возвращает false если не является предком', async () => {
    mockGitError('exit code 1');

    const result = await isAncestor('/repo', 'abc', 'xyz');

    expect(result).toBe(false);
  });
});
