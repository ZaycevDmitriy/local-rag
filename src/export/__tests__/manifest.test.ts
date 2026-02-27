import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeManifest, readManifest } from '../manifest.js';
import type { Manifest } from '../manifest.js';

describe('manifest', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-manifest-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const validManifest: Manifest = {
    version: 1,
    schemaVersion: 3,
    createdAt: '2026-02-27T12:00:00Z',
    localRagVersion: '0.1.0',
    sources: [
      {
        name: 'test-source',
        type: 'local',
        path: '/tmp/test',
        chunksCount: 100,
        hasEmbeddings: true,
      },
    ],
    includesEmbeddings: true,
    includesConfig: true,
  };

  describe('writeManifest / readManifest roundtrip', () => {
    it('записывает и читает манифест корректно', async () => {
      await writeManifest(tmpDir, validManifest);
      const result = await readManifest(tmpDir);
      expect(result).toEqual(validManifest);
    });

    it('записывает валидный JSON', async () => {
      await writeManifest(tmpDir, validManifest);
      const raw = await readFile(join(tmpDir, 'manifest.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.sources).toHaveLength(1);
    });

    it('поддерживает git-источник с path=null', async () => {
      const manifest: Manifest = {
        ...validManifest,
        sources: [
          {
            name: 'git-source',
            type: 'git',
            path: null,
            chunksCount: 50,
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

    it('бросает на невалидную версию (version: 2)', async () => {
      const invalid = { ...validManifest, version: 2 };
      await writeFile(
        join(tmpDir, 'manifest.json'),
        JSON.stringify(invalid),
        'utf-8',
      );
      await expect(readManifest(tmpDir)).rejects.toThrow();
    });

    it('бросает на отсутствующее поле sources', async () => {
      const { sources: _sources, ...noSources } = validManifest;
      void _sources;
      await writeFile(
        join(tmpDir, 'manifest.json'),
        JSON.stringify(noSources),
        'utf-8',
      );
      await expect(readManifest(tmpDir)).rejects.toThrow();
    });
  });
});
