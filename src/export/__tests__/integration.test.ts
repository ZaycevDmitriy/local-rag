import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import {
  writeManifest,
  readManifest,
  packArchive,
  unpackArchive,
  escapeValue,
  generateInsert,
  parseStatements,
} from '../index.js';
import type { Manifest } from '../index.js';

describe('export/import integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-integration-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('структура архива', () => {
    it('создаёт корректную структуру: manifest.json + data/*.sql + config.yaml', async () => {
      const sourceDir = join(tmpDir, 'export');
      const dataDir = join(sourceDir, 'data');
      await mkdir(dataDir, { recursive: true });

      // Манифест.
      const manifest: Manifest = {
        version: 1,
        schemaVersion: 3,
        createdAt: '2026-02-27T12:00:00Z',
        localRagVersion: '0.1.0',
        sources: [
          {
            name: 'test-source',
            type: 'local',
            path: '/tmp/test',
            chunksCount: 2,
            hasEmbeddings: true,
          },
        ],
        includesEmbeddings: true,
        includesConfig: true,
      };
      await writeManifest(sourceDir, manifest);

      // Конфиг.
      await writeFile(
        join(sourceDir, 'config.yaml'),
        'database:\n  host: localhost\n  password: ${DB_PASSWORD}\n',
        'utf-8',
      );

      // SQL-данные.
      const sqlContent = [
        '-- Source: test-source',
        '-- Exported: 2026-02-27T12:00:00Z',
        '',
        generateInsert('sources', {
          id: 'src-1',
          name: 'test-source',
          type: 'local',
          path: '/tmp/test',
        }),
        '',
        generateInsert('chunks', {
          id: 'chunk-1',
          source_id: 'src-1',
          content: 'function hello() {}',
          content_hash: 'abc123',
          metadata: { path: 'src/hello.ts', sourceType: 'code' },
          embedding: [0.1, 0.2, 0.3],
          created_at: new Date('2026-02-27T12:00:00Z'),
        }),
      ].join('\n');
      await writeFile(join(dataDir, 'test-source.sql'), sqlContent, 'utf-8');

      // Архивация.
      const archivePath = join(tmpDir, 'test.tar.gz');
      await packArchive(sourceDir, archivePath, true);
      expect(existsSync(archivePath)).toBe(true);

      // Распаковка.
      const unpackDir = join(tmpDir, 'unpack');
      await mkdir(unpackDir);
      await unpackArchive(archivePath, unpackDir);

      // Проверка структуры.
      expect(existsSync(join(unpackDir, 'manifest.json'))).toBe(true);
      expect(existsSync(join(unpackDir, 'config.yaml'))).toBe(true);
      expect(existsSync(join(unpackDir, 'data', 'test-source.sql'))).toBe(true);

      // Проверка манифеста.
      const readBackManifest = await readManifest(unpackDir);
      expect(readBackManifest.version).toBe(1);
      expect(readBackManifest.sources).toHaveLength(1);
      expect(readBackManifest.sources[0]!.name).toBe('test-source');
    });
  });

  describe('export --no-embeddings', () => {
    it('NULL вместо вектора при --no-embeddings', () => {
      const withEmbeddings = generateInsert('chunks', {
        id: 'c1',
        embedding: [0.1, 0.2],
      });
      expect(withEmbeddings).toContain('::vector');

      const withoutEmbeddings = generateInsert('chunks', {
        id: 'c1',
        embedding: null,
      });
      expect(withoutEmbeddings).toContain('NULL');
      expect(withoutEmbeddings).not.toContain('::vector');
    });
  });

  describe('escapeValue — спецсимволы', () => {
    it('контент с переносами строк', () => {
      const value = 'line1\nline2\nline3';
      const escaped = escapeValue(value);
      expect(escaped).toBe('\'line1\nline2\nline3\'');
    });

    it('контент с одинарными кавычками', () => {
      const value = 'it\'s a "test"';
      const escaped = escapeValue(value);
      expect(escaped).toBe('\'it\'\'s a "test"\'');
    });

    it('контент с обратными слэшами', () => {
      const value = 'path\\to\\file';
      const escaped = escapeValue(value);
      expect(escaped).toBe('\'path\\to\\file\'');
    });

    it('JSON metadata с вложенными объектами', () => {
      const metadata = {
        path: 'src/app.ts',
        nested: { key: 'value' },
        arr: [1, 2, 3],
      };
      const escaped = escapeValue(metadata);
      expect(escaped).toContain('::jsonb');
      expect(escaped).toContain('"nested"');
    });
  });

  describe('roundtrip: generate → parse SQL', () => {
    it('сгенерированные INSERT парсятся обратно', () => {
      const inserts = [
        generateInsert('sources', { id: 'src-1', name: 'test' }),
        generateInsert('chunks', { id: 'c-1', content: 'hello' }),
        generateInsert('chunks', { id: 'c-2', content: 'world' }),
      ];

      const sqlContent = [
        '-- Source: test',
        '-- Exported: 2026-02-27',
        '',
        ...inserts,
      ].join('\n');

      const statements = parseStatements(sqlContent);
      expect(statements).toHaveLength(3);

      for (const stmt of statements) {
        expect(stmt).toMatch(/^INSERT INTO /);
        expect(stmt).toMatch(/;$/);
      }
    });

    it('SQL с многострочным контентом парсится корректно', () => {
      // generateInsert создаёт однострочный INSERT, поэтому parseStatements
      // должен корректно обработать содержимое с \n внутри строки.
      const insert = generateInsert('chunks', {
        id: 'c1',
        content: 'line1\nline2',
      });

      // Весь INSERT — одна строка (переносы в content экранированы внутри строки SQL).
      const statements = parseStatements(insert);
      expect(statements).toHaveLength(1);
    });
  });

  describe('конфиг с плейсхолдерами', () => {
    it('плейсхолдеры сохраняются в архиве', async () => {
      const sourceDir = join(tmpDir, 'src');
      await mkdir(sourceDir);

      const configContent = 'apiKey: ${JINA_API_KEY}\npassword: ${DB_PASS}\n';
      await writeFile(join(sourceDir, 'config.yaml'), configContent, 'utf-8');
      await writeFile(join(sourceDir, 'manifest.json'), '{"version":1}', 'utf-8');

      const archivePath = join(tmpDir, 'config-test.tar.gz');
      await packArchive(sourceDir, archivePath, true);

      const unpackDir = join(tmpDir, 'unpack');
      await mkdir(unpackDir);
      await unpackArchive(archivePath, unpackDir);

      const restored = await readFile(join(unpackDir, 'config.yaml'), 'utf-8');
      expect(restored).toContain('${JINA_API_KEY}');
      expect(restored).toContain('${DB_PASS}');
    });
  });
});
