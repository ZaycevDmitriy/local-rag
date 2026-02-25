import { describe, it, expect } from 'vitest';
import { MarkdownChunker } from '../markdown/markdown-chunker.js';
import type { FileContent } from '../types.js';

// Большой лимит, чтобы секции не резались.
const config = { maxTokens: 500, overlap: 50 };

function makeFile(content: string, path = 'doc.md'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('MarkdownChunker', () => {
  describe('supports', () => {
    it('поддерживает .md файлы', () => {
      const chunker = new MarkdownChunker(config);
      expect(chunker.supports('readme.md')).toBe(true);
      expect(chunker.supports('docs/guide.md')).toBe(true);
    });

    it('поддерживает .mdx файлы', () => {
      const chunker = new MarkdownChunker(config);
      expect(chunker.supports('component.mdx')).toBe(true);
      expect(chunker.supports('docs/page.MDX')).toBe(true);
    });

    it('не поддерживает другие расширения', () => {
      const chunker = new MarkdownChunker(config);
      expect(chunker.supports('file.txt')).toBe(false);
      expect(chunker.supports('file.ts')).toBe(false);
      expect(chunker.supports('file.js')).toBe(false);
      expect(chunker.supports('markdown')).toBe(false);
    });
  });

  describe('chunk', () => {
    it('возвращает пустой массив для пустого файла', () => {
      const chunker = new MarkdownChunker(config);
      const result = chunker.chunk(makeFile(''));
      expect(result).toEqual([]);
    });

    it('файл без заголовков — один чанк', () => {
      const chunker = new MarkdownChunker(config);
      const content = 'Just some text\nwithout any headings.';
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe(content);
      expect(result[0]!.metadata.sourceType).toBe('markdown');
      expect(result[0]!.metadata.headerPath).toBeUndefined();
      expect(result[0]!.metadata.headerLevel).toBeUndefined();
    });

    it('разбивает по заголовкам одного уровня', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# Introduction',
        'Intro text.',
        '# Methods',
        'Methods text.',
        '# Results',
        'Results text.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(3);
      expect(result[0]!.content).toContain('# Introduction');
      expect(result[0]!.content).toContain('Intro text.');
      expect(result[1]!.content).toContain('# Methods');
      expect(result[1]!.content).toContain('Methods text.');
      expect(result[2]!.content).toContain('# Results');
      expect(result[2]!.content).toContain('Results text.');
    });

    it('формирует правильный headerPath', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# API',
        'API overview.',
        '## Auth',
        'Auth text.',
        '### JWT',
        'JWT details.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(3);
      expect(result[0]!.metadata.headerPath).toBe('# API');
      expect(result[1]!.metadata.headerPath).toBe('# API > ## Auth');
      expect(result[2]!.metadata.headerPath).toBe('# API > ## Auth > ### JWT');
    });

    it('устанавливает headerLevel для каждой секции', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# Level 1',
        'Text.',
        '## Level 2',
        'Text.',
        '### Level 3',
        'Text.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.metadata.headerLevel).toBe(1);
      expect(result[1]!.metadata.headerLevel).toBe(2);
      expect(result[2]!.metadata.headerLevel).toBe(3);
    });

    it('вложенные секции: h1 > h2 > h3 с возвратом на h2', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# Main',
        'Main text.',
        '## Sub A',
        'Sub A text.',
        '### Detail',
        'Detail text.',
        '## Sub B',
        'Sub B text.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(4);

      // Sub B должен иметь headerPath "# Main > ## Sub B" (без ### Detail).
      expect(result[3]!.metadata.headerPath).toBe('# Main > ## Sub B');
      expect(result[3]!.metadata.headerLevel).toBe(2);
    });

    it('текст перед первым заголовком формирует отдельный чанк', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        'Preamble text before any heading.',
        '',
        '# First Section',
        'Section content.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(2);
      expect(result[0]!.content).toContain('Preamble text');
      expect(result[0]!.metadata.headerPath).toBeUndefined();
      expect(result[1]!.content).toContain('# First Section');
    });

    it('устанавливает startLine и endLine', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# Header',
        'Line 1.',
        'Line 2.',
        '## Sub',
        'Sub text.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(2);
      // Первая секция: строки 1-3.
      expect(result[0]!.metadata.startLine).toBe(1);
      expect(result[0]!.metadata.endLine).toBe(3);
      // Вторая секция: строки 4-5.
      expect(result[1]!.metadata.startLine).toBe(4);
      expect(result[1]!.metadata.endLine).toBe(5);
    });

    it('большая секция разрезается на несколько чанков', () => {
      // Маленький лимит: 25 токенов = 100 символов.
      const smallConfig = { maxTokens: 25, overlap: 5 };
      const chunker = new MarkdownChunker(smallConfig);

      const lines = ['# Big Section'];
      for (let i = 0; i < 20; i++) {
        lines.push(`Line ${i}: ${'x'.repeat(10)}`);
      }
      const content = lines.join('\n');
      const result = chunker.chunk(makeFile(content));

      // Должно быть > 1 чанка.
      expect(result.length).toBeGreaterThan(1);

      // Все чанки должны иметь headerPath.
      for (const chunk of result) {
        expect(chunk.metadata.headerPath).toBe('# Big Section');
        expect(chunk.metadata.sourceType).toBe('markdown');
      }
    });

    it('генерирует уникальные id для каждого чанка', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# A',
        'Text A.',
        '# B',
        'Text B.',
        '# C',
        'Text C.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      const ids = result.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('contentHash — это SHA-256', () => {
      const chunker = new MarkdownChunker(config);
      const content = '# Test\nContent.';
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.contentHash).toBeTruthy();
      expect(result[0]!.contentHash.length).toBe(64);
    });

    it('только пробельные секции не создают чанки', () => {
      const chunker = new MarkdownChunker(config);
      const content = [
        '# A',
        'Text.',
        '# B',
        '   ',
        '# C',
        'More text.',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      // Секция B содержит только пробелы — не должна создаваться.
      const contents = result.map(c => c.content);
      expect(contents.some(c => c.trim() === '')).toBe(false);
    });
  });
});
