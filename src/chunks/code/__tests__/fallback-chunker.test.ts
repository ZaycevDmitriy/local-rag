import { describe, it, expect } from 'vitest';
import { FallbackChunker } from '../fallback-chunker.js';
import type { FileContent } from '../../types.js';

const config = { maxTokens: 500, overlap: 50 };

function makeFile(content: string, path = 'script.py'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('FallbackChunker', () => {
  describe('supports', () => {
    it('поддерживает .py файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('script.py')).toBe(true);
    });

    it('поддерживает .go файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('main.go')).toBe(true);
    });

    it('поддерживает .java файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('App.java')).toBe(true);
    });

    it('поддерживает .rs файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('main.rs')).toBe(true);
    });

    it('поддерживает .rb, .php, .c, .cpp, .h, .hpp, .cs, .swift, .kt', () => {
      const chunker = new FallbackChunker(config);
      for (const ext of ['.rb', '.php', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt']) {
        expect(chunker.supports(`file${ext}`)).toBe(true);
      }
    });

    it('не поддерживает .ts файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('index.ts')).toBe(false);
    });

    it('не поддерживает .js файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('app.js')).toBe(false);
    });

    it('не поддерживает .md файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('readme.md')).toBe(false);
    });

    it('не поддерживает .txt файлы', () => {
      const chunker = new FallbackChunker(config);
      expect(chunker.supports('notes.txt')).toBe(false);
    });
  });

  describe('chunk', () => {
    it('возвращает пустой массив для пустого файла', () => {
      const chunker = new FallbackChunker(config);
      const result = chunker.chunk(makeFile(''));
      expect(result).toEqual([]);
    });

    it('Python-файл с функциями через \\n\\n -> отдельные чанки', () => {
      // Маленький лимит: 10 токенов = 40 символов.
      // Каждая функция ~30 chars — помещается отдельно, но не вдвоём.
      const smallConfig = { maxTokens: 10, overlap: 2 };
      const chunker = new FallbackChunker(smallConfig);
      const content = [
        'def hello():',
        '    print("hello")',
        '',
        '',
        'def world():',
        '    print("world")',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(2);
      expect(result[0]!.content).toContain('def hello');
      expect(result[1]!.content).toContain('def world');
    });

    it('sourceType === code', () => {
      const chunker = new FallbackChunker(config);
      const content = 'def greet():\n    pass';
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.metadata.sourceType).toBe('code');
    });

    it('language === python для .py файлов', () => {
      const chunker = new FallbackChunker(config);
      const content = 'def greet():\n    pass';
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.metadata.language).toBe('python');
    });

    it('без fqn и fragmentType', () => {
      const chunker = new FallbackChunker(config);
      const content = 'def greet():\n    pass';
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.metadata.fqn).toBeUndefined();
      expect(result[0]!.metadata.fragmentType).toBeUndefined();
    });

    it('маленькие блоки группируются в один чанк', () => {
      const chunker = new FallbackChunker(config);
      const content = [
        'x = 1',
        '',
        '',
        'y = 2',
        '',
        '',
        'z = 3',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      // Все блоки маленькие — должен быть один чанк (500 токенов = 2000 символов, много места).
      expect(result).toHaveLength(1);
    });

    it('длинный блок разрезается с overlap', () => {
      const smallConfig = { maxTokens: 10, overlap: 2 };
      const chunker = new FallbackChunker(smallConfig);

      // Один большой блок без пустых строк.
      const lines: string[] = [];
      for (let i = 0; i < 30; i++) {
        lines.push(`x_${i} = ${i}`);
      }
      const content = lines.join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result.length).toBeGreaterThan(1);
    });

    it('корректные startLine и endLine', () => {
      // Маленький лимит: каждый блок ~21 chars, вдвоём > 40 -> разделятся.
      const smallConfig = { maxTokens: 10, overlap: 2 };
      const chunker = new FallbackChunker(smallConfig);
      const content = [
        'def hello():',  // строка 1
        '    pass',      // строка 2
        '',              // строка 3 (пустая)
        '',              // строка 4 (пустая)
        'def world():',  // строка 5
        '    pass',      // строка 6
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(2);
      expect(result[0]!.metadata.startLine).toBe(1);
      expect(result[0]!.metadata.endLine).toBe(2);
      expect(result[1]!.metadata.startLine).toBe(5);
      expect(result[1]!.metadata.endLine).toBe(6);
    });

    it('language === go для .go файлов', () => {
      const chunker = new FallbackChunker(config);
      const content = 'func main() {\n\tfmt.Println("hello")\n}';
      const result = chunker.chunk(makeFile(content, 'main.go'));

      expect(result[0]!.metadata.language).toBe('go');
    });

    it('генерирует уникальные id', () => {
      const chunker = new FallbackChunker(config);
      const content = [
        'def a(): pass',
        '',
        '',
        'def b(): pass',
        '',
        '',
        'def c(): pass',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      const ids = result.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
