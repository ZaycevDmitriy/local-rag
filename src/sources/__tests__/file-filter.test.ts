// Тесты для FileFilter.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileFilter } from '../file-filter.js';

describe('FileFilter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'file-filter-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('встроенные исключения', () => {
    it('исключает node_modules', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('node_modules/lodash/index.js')).toBe(false);
    });

    it('исключает .git', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('.git/config')).toBe(false);
    });

    it('исключает dist', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('dist/bundle.js')).toBe(false);
    });

    it('исключает build', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('build/index.js')).toBe(false);
    });

    it('исключает .next', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('.next/server/pages/index.js')).toBe(false);
    });

    it('исключает coverage', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('coverage/lcov-report/index.html')).toBe(false);
    });

    it('исключает *.lock файлы', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('yarn.lock')).toBe(false);
      expect(filter.shouldInclude('subdir/bun.lock')).toBe(false);
    });

    it('исключает package-lock.json', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('package-lock.json')).toBe(false);
    });
  });

  describe('бинарные расширения', () => {
    it('исключает .png', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('assets/logo.png')).toBe(false);
    });

    it('исключает .mp4', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('videos/demo.mp4')).toBe(false);
    });

    it('исключает .zip', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('archive.zip')).toBe(false);
    });

    it('исключает .exe', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('tool.exe')).toBe(false);
    });

    it('не исключает .ts файлы', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('src/index.ts')).toBe(true);
    });

    it('не исключает .md файлы', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('README.md')).toBe(true);
    });
  });

  describe('.gitignore паттерны', () => {
    it('применяет .gitignore после init()', async () => {
      await writeFile(join(tmpDir, '.gitignore'), '*.env\nsecrets/\n');
      const filter = new FileFilter(tmpDir);
      await filter.init();

      expect(filter.shouldInclude('config.env')).toBe(false);
      expect(filter.shouldInclude('secrets/api-key.txt')).toBe(false);
      expect(filter.shouldInclude('src/index.ts')).toBe(true);
    });

    it('не применяет .gitignore до init()', () => {
      const filter = new FileFilter(tmpDir);
      // init() не вызван — gitignore не загружен, но файл и не создан
      expect(filter.shouldInclude('src/index.ts')).toBe(true);
    });
  });

  describe('.ragignore паттерны', () => {
    it('применяет .ragignore после init()', async () => {
      await writeFile(join(tmpDir, '.ragignore'), '*.test.ts\n__tests__/\n');
      const filter = new FileFilter(tmpDir);
      await filter.init();

      expect(filter.shouldInclude('src/component.test.ts')).toBe(false);
      expect(filter.shouldInclude('src/__tests__/helper.ts')).toBe(false);
      expect(filter.shouldInclude('src/component.ts')).toBe(true);
    });
  });

  describe('конфиг exclude паттерны', () => {
    it('применяет exclude из конфига', async () => {
      const filter = new FileFilter(tmpDir, ['generated/**', '*.gen.ts']);
      await filter.init();

      expect(filter.shouldInclude('generated/schema.ts')).toBe(false);
      expect(filter.shouldInclude('api.gen.ts')).toBe(false);
      expect(filter.shouldInclude('src/api.ts')).toBe(true);
    });
  });

  describe('отсутствие .gitignore/.ragignore', () => {
    it('не выбрасывает ошибку, если .gitignore отсутствует', async () => {
      const filter = new FileFilter(tmpDir);
      await expect(filter.init()).resolves.not.toThrow();
    });

    it('включает обычные файлы при отсутствии .gitignore/.ragignore', async () => {
      const filter = new FileFilter(tmpDir);
      await filter.init();
      expect(filter.shouldInclude('src/index.ts')).toBe(true);
      expect(filter.shouldInclude('docs/guide.md')).toBe(true);
    });
  });
});
