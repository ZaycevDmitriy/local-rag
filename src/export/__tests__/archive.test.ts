import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { packArchive, unpackArchive } from '../archive.js';

describe('archive', () => {
  let tmpDir: string;
  let sourceDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-archive-'));
    sourceDir = join(tmpDir, 'source');
    outputDir = join(tmpDir, 'output');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('создаёт .tar.gz архив', async () => {
    await writeFile(join(sourceDir, 'test.txt'), 'hello', 'utf-8');
    const archivePath = join(tmpDir, 'test.tar.gz');

    await packArchive(sourceDir, archivePath, true);

    expect(existsSync(archivePath)).toBe(true);
  });

  it('создаёт .tar без сжатия', async () => {
    await writeFile(join(sourceDir, 'test.txt'), 'hello', 'utf-8');
    const archivePath = join(tmpDir, 'test.tar');

    await packArchive(sourceDir, archivePath, false);

    expect(existsSync(archivePath)).toBe(true);
  });

  it('roundtrip: pack → unpack → файлы совпадают', async () => {
    // Создаём структуру файлов.
    await mkdir(join(sourceDir, 'data'), { recursive: true });
    await writeFile(join(sourceDir, 'manifest.json'), '{"version":1}', 'utf-8');
    await writeFile(join(sourceDir, 'data', 'source.sql'), 'INSERT INTO ...', 'utf-8');

    const archivePath = join(tmpDir, 'roundtrip.tar.gz');

    await packArchive(sourceDir, archivePath, true);
    await unpackArchive(archivePath, outputDir);

    const manifest = await readFile(join(outputDir, 'manifest.json'), 'utf-8');
    expect(manifest).toBe('{"version":1}');

    const sql = await readFile(join(outputDir, 'data', 'source.sql'), 'utf-8');
    expect(sql).toBe('INSERT INTO ...');
  });

  it('roundtrip без сжатия', async () => {
    await writeFile(join(sourceDir, 'file.txt'), 'content', 'utf-8');
    const archivePath = join(tmpDir, 'nocompress.tar');

    await packArchive(sourceDir, archivePath, false);
    await unpackArchive(archivePath, outputDir);

    const content = await readFile(join(outputDir, 'file.txt'), 'utf-8');
    expect(content).toBe('content');
  });
});
