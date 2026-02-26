import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { detectChanges } from '../incremental.js';
import type { IndexedFileStorage } from '../../storage/indexed-files.js';
import type { ScannedFile } from '../../sources/local.js';

// Вычисляет SHA-256 хэш строки (дублируем для тестов).
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// Создаёт мок IndexedFileStorage.
function createStorageMock(
  rows: Array<{ path: string; file_hash: string }>,
): IndexedFileStorage {
  return {
    getBySource: vi.fn().mockResolvedValue(
      rows.map((r) => ({
        id: `id-${r.path}`,
        source_id: 'source-1',
        path: r.path,
        file_hash: r.file_hash,
        indexed_at: new Date(),
      })),
    ),
    upsert: vi.fn(),
    deleteBySource: vi.fn(),
    deleteByPath: vi.fn(),
  } as unknown as IndexedFileStorage;
}

// Создаёт ScannedFile с заданным контентом.
function makeFile(relativePath: string, content: string): ScannedFile {
  return {
    absolutePath: `/base/${relativePath}`,
    relativePath,
    content,
  };
}

describe('detectChanges', () => {
  it('все файлы новые — все попадают в changed со статусом added', async () => {
    const storage = createStorageMock([]);
    const files = [
      makeFile('a.md', 'content A'),
      makeFile('b.md', 'content B'),
    ];

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(2);
    expect(result.changed[0]).toMatchObject({
      path: 'a.md',
      absolutePath: '/base/a.md',
      content: 'content A',
      hash: sha256('content A'),
      status: 'added',
    });
    expect(result.changed[1]).toMatchObject({ path: 'b.md', status: 'added' });
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toEqual([]);
  });

  it('файлы не изменились — все в unchanged', async () => {
    const files = [
      makeFile('a.md', 'content A'),
      makeFile('b.md', 'content B'),
    ];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content A') },
      { path: 'b.md', file_hash: sha256('content B') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(2);
    expect(result.deleted).toEqual([]);
  });

  it('один файл изменился — статус modified', async () => {
    const files = [
      makeFile('a.md', 'new content A'),
      makeFile('b.md', 'content B'),
    ];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('old content A') },
      { path: 'b.md', file_hash: sha256('content B') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({
      path: 'a.md',
      status: 'modified',
      hash: sha256('new content A'),
    });
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toEqual([]);
  });

  it('файл удалён — попадает в deleted', async () => {
    const files = [makeFile('a.md', 'content A')];

    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content A') },
      { path: 'deleted.md', file_hash: sha256('old content') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toEqual(['deleted.md']);
  });

  it('смешанный сценарий: added + modified + unchanged + deleted', async () => {
    const files = [
      makeFile('unchanged.md', 'same content'),
      makeFile('modified.md', 'new content'),
      makeFile('added.md', 'brand new'),
    ];

    const storage = createStorageMock([
      { path: 'unchanged.md', file_hash: sha256('same content') },
      { path: 'modified.md', file_hash: sha256('old content') },
      { path: 'deleted.md', file_hash: sha256('will be deleted') },
    ]);

    const result = await detectChanges('source-1', files, storage);

    expect(result.unchanged).toBe(1);

    const changedPaths = result.changed.map((c) => c.path);
    expect(changedPaths).toContain('modified.md');
    expect(changedPaths).toContain('added.md');
    expect(result.changed.find((c) => c.path === 'modified.md')?.status).toBe('modified');
    expect(result.changed.find((c) => c.path === 'added.md')?.status).toBe('added');

    expect(result.deleted).toEqual(['deleted.md']);
  });

  it('пустой список файлов — все сохранённые попадают в deleted', async () => {
    const storage = createStorageMock([
      { path: 'a.md', file_hash: sha256('content') },
      { path: 'b.md', file_hash: sha256('content') },
    ]);

    const result = await detectChanges('source-1', [], storage);

    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toHaveLength(2);
    expect(result.deleted).toContain('a.md');
    expect(result.deleted).toContain('b.md');
  });
});
