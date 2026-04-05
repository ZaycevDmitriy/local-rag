import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeManifest, readManifest } from '../manifest.js';
import type { Manifest } from '../manifest.js';

describe('manifest v2', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-manifest-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const validManifest: Manifest = {
    version: 2,
    schemaVersion: 5,
    createdAt: '2026-04-05T12:00:00Z',
    localRagVersion: '0.1.0',
    sources: [
      {
        name: 'test-source',
        type: 'local',
        path: '/tmp/test',
        viewCount: 2,
        chunkCount: 100,
        fileBlobCount: 50,
        chunkContentCount: 80,
        hasEmbeddings: true,
      },
    ],
    includesEmbeddings: true,
    includesConfig: true,
  };

  describe('writeManifest / readManifest roundtrip', () => {
    it('записывает и читает v2 манифест корректно', async () => {
      await writeManifest(tmpDir, validManifest);
      const result = await readManifest(tmpDir);
      expect(result).toEqual(validManifest);
    });

    it('записывает валидный JSON с version=2', async () => {
      await writeManifest(tmpDir, validManifest);
      const raw = await readFile(join(tmpDir, 'manifest.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(2);
      expect(parsed.sources).toHaveLength(1);
      expect(parsed.sources[0].viewCount).toBe(2);
    });

    it('поддерживает git-источник с path=null', async () => {
      const manifest: Manifest = {
        ...validManifest,
        sources: [
          {
            name: 'git-source',
            type: 'git',
            path: null,
            viewCount: 1,
            chunkCount: 50,
            fileBlobCount: 20,
            chunkContentCount: 40,
            hasEmbeddings: false,
          },
        ],
      };
      await writeManifest(tmpDir, manifest);
      const result = await readManifest(tmpDir);
      expect(result.sources[0]!.path).toBeNull();
    });
  });

  describe('readManifest — ошибки', () => {
    it('бросает на невалидный JSON', async () => {
      await writeFile(join(tmpDir, 'manifest.json'), 'not json', 'utf-8');
      await expect(readManifest(tmpDir)).rejects.toThrow('Invalid JSON');
    });

    it('бросает на отсутствующий файл', async () => {
      await expect(readManifest(tmpDir)).rejects.toThrow();
    });

    it('reject v1 manifest с информативной ошибкой', async () => {
      const v1Manifest = {
        version: 1,
        schemaVersion: 3,
        createdAt: '2026-02-27T12:00:00Z',
        localRagVersion: '0.1.0',
        sources: [{ name: 'old', type: 'local', path: '/tmp', chunksCount: 10, hasEmbeddings: true }],
        includesEmbeddings: true,
        includesConfig: false,
      };
      await writeFile(join(tmpDir, 'manifest.json'), JSON.stringify(v1Manifest), 'utf-8');
      await expect(readManifest(tmpDir)).rejects.toThrow('incompatible');
    });

    it('бросает на отсутствующее поле sources', async () => {
      const { sources: _sources, ...noSources } = validManifest;
      void _sources;
      await writeFile(join(tmpDir, 'manifest.json'), JSON.stringify(noSources), 'utf-8');
      await expect(readManifest(tmpDir)).rejects.toThrow();
    });

    it('бросает на неизвестную версию (version: 99)', async () => {
      const badVersion = { ...validManifest, version: 99 };
      await writeFile(join(tmpDir, 'manifest.json'), JSON.stringify(badVersion), 'utf-8');
      await expect(readManifest(tmpDir)).rejects.toThrow();
    });
  });
});
