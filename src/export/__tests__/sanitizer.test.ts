import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sanitizeConfig } from '../sanitizer.js';

describe('sanitizer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-sanitizer-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('копирует файл с ${ENV_VAR} плейсхолдерами без изменений', async () => {
    const content = [
      'database:',
      '  host: localhost',
      '  password: ${DB_PASSWORD}',
      'embeddings:',
      '  apiKey: ${JINA_API_KEY}',
    ].join('\n');
    const inputPath = join(tmpDir, 'config.yaml');
    const outputPath = join(tmpDir, 'output.yaml');

    await writeFile(inputPath, content, 'utf-8');
    await sanitizeConfig(inputPath, outputPath);

    const result = await readFile(outputPath, 'utf-8');
    expect(result).toBe(content);
  });

  it('копирует файл без плейсхолдеров', async () => {
    const content = 'database:\n  host: localhost\n  port: 5432\n';
    const inputPath = join(tmpDir, 'config.yaml');
    const outputPath = join(tmpDir, 'output.yaml');

    await writeFile(inputPath, content, 'utf-8');
    await sanitizeConfig(inputPath, outputPath);

    const result = await readFile(outputPath, 'utf-8');
    expect(result).toBe(content);
  });

  it('бросает ошибку на несуществующий файл', async () => {
    const inputPath = join(tmpDir, 'nonexistent.yaml');
    const outputPath = join(tmpDir, 'output.yaml');

    await expect(sanitizeConfig(inputPath, outputPath)).rejects.toThrow();
  });
});
