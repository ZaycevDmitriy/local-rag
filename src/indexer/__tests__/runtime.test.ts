import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import type postgres from 'postgres';
import { AppConfigSchema, type SourceConfig } from '../../config/index.js';
import { SourceStorage } from '../../storage/index.js';
import { Indexer } from '../indexer.js';
import { ConsoleProgress } from '../progress.js';

vi.mock('../../sources/index.js', () => ({
  cloneOrPull: vi.fn(),
  scanLocalFiles: vi.fn(),
}));

import { cloneOrPull, scanLocalFiles } from '../../sources/index.js';
import { createIndexerRuntime, indexSourceFromConfig, type IndexerRuntime } from '../runtime.js';

function createConfig() {
  return AppConfigSchema.parse({
    embeddings: {
      provider: 'jina',
      jina: {
        apiKey: 'jina-key',
      },
    },
    indexing: {
      git: {
        cloneDir: '~/custom/repos',
      },
      chunkSize: {
        maxTokens: 256,
        overlap: 32,
      },
    },
  });
}

function createRuntimeMock() {
  const sourceStorage = {
    upsert: vi.fn(),
  };
  const indexer = {
    indexSource: vi.fn(),
  };
  const progress = {
    onScanComplete: vi.fn(),
  };

  return {
    sourceStorage,
    indexer,
    progress,
    runtime: {
      sourceStorage: sourceStorage as unknown as IndexerRuntime['sourceStorage'],
      indexer: indexer as unknown as IndexerRuntime['indexer'],
      progress: progress as unknown as IndexerRuntime['progress'],
      cloneDir: '~/test/repos',
    } satisfies IndexerRuntime,
  };
}

describe('createIndexerRuntime', () => {
  it('создаёт runtime с ожидаемыми зависимостями и cloneDir из конфига', () => {
    const sql = vi.fn() as unknown as postgres.Sql;

    const runtime = createIndexerRuntime(sql, createConfig());

    expect(runtime.cloneDir).toBe('~/custom/repos');
    expect(runtime.sourceStorage).toBeInstanceOf(SourceStorage);
    expect(runtime.indexer).toBeInstanceOf(Indexer);
    expect(runtime.progress).toBeInstanceOf(ConsoleProgress);
  });
});

describe('indexSourceFromConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('индексирует git-источник через clone/pull, scan и indexer', async () => {
    const sourceConfig: SourceConfig = {
      name: 'repo',
      type: 'git',
      url: 'https://github.com/example/repo.git',
      include: ['**/*.ts'],
      exclude: ['dist/**'],
    };
    const scannedFiles = [{
      absolutePath: '/tmp/repo/src/index.ts',
      relativePath: 'src/index.ts',
      content: 'export const value = 1;',
    }];
    const sourceRow = { id: 'source-1' };
    const { sourceStorage, indexer, progress, runtime } = createRuntimeMock();

    vi.mocked(cloneOrPull).mockResolvedValue({ localPath: '/tmp/repo' });
    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: scannedFiles,
      excludedCount: 2,
    });
    sourceStorage.upsert.mockResolvedValue(sourceRow);
    indexer.indexSource.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    expect(cloneOrPull).toHaveBeenCalledWith(
      'https://github.com/example/repo.git',
      'main',
      '~/test/repos',
    );
    expect(sourceStorage.upsert).toHaveBeenCalledWith({
      name: 'repo',
      type: 'git',
      path: '/tmp/repo',
      gitUrl: 'https://github.com/example/repo.git',
      gitBranch: 'main',
      config: {
        include: ['**/*.ts'],
        exclude: ['dist/**'],
      },
    });
    expect(scanLocalFiles).toHaveBeenCalledWith('/tmp/repo', {
      include: ['**/*.ts'],
      exclude: ['dist/**'],
    });
    expect(progress.onScanComplete).toHaveBeenCalledWith(1, 2);
    expect(indexer.indexSource).toHaveBeenCalledWith(sourceRow, scannedFiles);
  });

  it('индексирует local-источник через resolved path и scan', async () => {
    const sourceConfig: SourceConfig = {
      name: 'workspace',
      type: 'local',
      path: './fixtures/project',
      include: ['**/*.md'],
    };
    const resolvedPath = resolve('./fixtures/project');
    const scannedFiles = [{
      absolutePath: `${resolvedPath}/README.md`,
      relativePath: 'README.md',
      content: '# Local RAG',
    }];
    const sourceRow = { id: 'source-2' };
    const { sourceStorage, indexer, progress, runtime } = createRuntimeMock();

    vi.mocked(scanLocalFiles).mockResolvedValue({
      files: scannedFiles,
      excludedCount: 0,
    });
    sourceStorage.upsert.mockResolvedValue(sourceRow);
    indexer.indexSource.mockResolvedValue(undefined);

    await indexSourceFromConfig(sourceConfig, runtime);

    expect(sourceStorage.upsert).toHaveBeenCalledWith({
      name: 'workspace',
      type: 'local',
      path: resolvedPath,
      config: {
        include: ['**/*.md'],
        exclude: undefined,
      },
    });
    expect(scanLocalFiles).toHaveBeenCalledWith(resolvedPath, {
      include: ['**/*.md'],
      exclude: undefined,
    });
    expect(progress.onScanComplete).toHaveBeenCalledWith(1, 0);
    expect(indexer.indexSource).toHaveBeenCalledWith(sourceRow, scannedFiles);
  });

  it('выбрасывает ошибку, если для git-источника не указан url', async () => {
    const { runtime } = createRuntimeMock();

    await expect(indexSourceFromConfig({
      name: 'broken-git',
      type: 'git',
    }, runtime)).rejects.toThrow('Не указан URL для git-источника "broken-git"');
  });

  it('выбрасывает ошибку, если для local-источника не указан path', async () => {
    const { runtime } = createRuntimeMock();

    await expect(indexSourceFromConfig({
      name: 'broken-local',
      type: 'local',
    }, runtime)).rejects.toThrow('Не указан путь для источника "broken-local"');
  });
});
