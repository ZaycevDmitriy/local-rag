import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import type { FileContent } from '../../types.js';

const config = { maxTokens: 500, overlap: 50 };

function makeFile(content: string, path = 'index.ts'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('TreeSitterChunker', () => {
  describe('supports', () => {
    it('поддерживает .ts файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('index.ts')).toBe(true);
      expect(chunker.supports('src/app.ts')).toBe(true);
    });

    it('поддерживает .tsx файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('Component.tsx')).toBe(true);
    });

    it('поддерживает .js файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('app.js')).toBe(true);
    });

    it('поддерживает .jsx файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('App.jsx')).toBe(true);
    });

    it('не поддерживает .md файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('readme.md')).toBe(false);
    });

    it('не поддерживает .py файлы', () => {
      const chunker = new TreeSitterChunker(config);
      expect(chunker.supports('script.py')).toBe(false);
    });
  });

  describe('chunk', () => {
    it('возвращает пустой массив для пустого файла', () => {
      const chunker = new TreeSitterChunker(config);
      const result = chunker.chunk(makeFile(''));
      expect(result).toEqual([]);
    });

    it('файл только с импортами -> один code-чанк', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'import { foo } from \'./foo.js\';\nimport { bar } from \'./bar.js\';';
      const result = chunker.chunk(makeFile(content));

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata.sourceType).toBe('code');
      expect(result[0]!.metadata.language).toBe('typescript');
    });

    it('класс с методами -> CLASS + METHOD чанки', () => {
      const chunker = new TreeSitterChunker(config);
      const content = [
        'class MyService {',
        '  doWork(): void {',
        '    console.log("work");',
        '  }',
        '',
        '  getResult(): string {',
        '    return "result";',
        '  }',
        '}',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
      const methodChunks = result.filter(c => c.metadata.fragmentType === 'METHOD');

      expect(classChunk).toBeDefined();
      expect(classChunk!.metadata.fqn).toBe('MyService');
      expect(methodChunks).toHaveLength(2);
      expect(methodChunks.map(c => c.metadata.fqn)).toContain('MyService.doWork');
      expect(methodChunks.map(c => c.metadata.fqn)).toContain('MyService.getResult');
    });

    it('export const arrow function -> FUNCTION чанк', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'export const myHandler = (x: number): number => {\n  return x * 2;\n};';
      const result = chunker.chunk(makeFile(content));

      const funcChunk = result.find(c => c.metadata.fragmentType === 'FUNCTION');
      expect(funcChunk).toBeDefined();
      expect(funcChunk!.metadata.fqn).toBe('myHandler');
    });

    it('interface -> INTERFACE чанк', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'interface UserData {\n  id: string;\n  name: string;\n}';
      const result = chunker.chunk(makeFile(content));

      const interfaceChunk = result.find(c => c.metadata.fragmentType === 'INTERFACE');
      expect(interfaceChunk).toBeDefined();
      expect(interfaceChunk!.metadata.fqn).toBe('UserData');
    });

    it('enum -> ENUM чанк', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'enum Status {\n  Active = \'active\',\n  Inactive = \'inactive\',\n}';
      const result = chunker.chunk(makeFile(content));

      const enumChunk = result.find(c => c.metadata.fragmentType === 'ENUM');
      expect(enumChunk).toBeDefined();
      expect(enumChunk!.metadata.fqn).toBe('Status');
    });

    it('export type -> TYPE чанк', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'export type UserId = string;';
      const result = chunker.chunk(makeFile(content));

      const typeChunk = result.find(c => c.metadata.fragmentType === 'TYPE');
      expect(typeChunk).toBeDefined();
      expect(typeChunk!.metadata.fqn).toBe('UserId');
    });

    it('metadata: sourceType === code и корректный язык', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'function greet(name: string): string {\n  return `Hello ${name}`;\n}';
      const result = chunker.chunk(makeFile(content, 'greet.ts'));

      expect(result[0]!.metadata.sourceType).toBe('code');
      expect(result[0]!.metadata.language).toBe('typescript');
    });

    it('корректные startLine/endLine', () => {
      const chunker = new TreeSitterChunker(config);
      const content = [
        'function first(): void {',
        '  console.log("first");',
        '}',
        '',
        'function second(): void {',
        '  console.log("second");',
        '}',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      const firstFunc = result.find(c => c.metadata.fqn === 'first');
      const secondFunc = result.find(c => c.metadata.fqn === 'second');

      expect(firstFunc!.metadata.startLine).toBe(1);
      expect(firstFunc!.metadata.endLine).toBe(3);
      expect(secondFunc!.metadata.startLine).toBe(5);
      expect(secondFunc!.metadata.endLine).toBe(7);
    });

    it('oversized функция -> несколько чанков', () => {
      // Маленький лимит: 10 токенов = 40 символов.
      const smallConfig = { maxTokens: 10, overlap: 2 };
      const chunker = new TreeSitterChunker(smallConfig);

      const lines = ['function bigFunction(): void {'];
      for (let i = 0; i < 20; i++) {
        lines.push(`  const var${i} = ${i};`);
      }
      lines.push('}');
      const content = lines.join('\n');
      const result = chunker.chunk(makeFile(content));

      expect(result.length).toBeGreaterThan(1);
      for (const chunk of result) {
        expect(chunk.metadata.fqn).toBe('bigFunction');
        expect(chunk.metadata.sourceType).toBe('code');
      }
    });

    it('TSX файл парсится корректно', () => {
      const chunker = new TreeSitterChunker(config);
      const content = [
        'export const Button = () => {',
        '  return <button>Click</button>;',
        '};',
      ].join('\n');
      const result = chunker.chunk(makeFile(content, 'Button.tsx'));

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.metadata.language).toBe('tsx');
    });

    it('JSX файл парсится корректно', () => {
      const chunker = new TreeSitterChunker(config);
      const content = [
        'export const App = () => {',
        '  return <div>Hello</div>;',
        '};',
      ].join('\n');
      const result = chunker.chunk(makeFile(content, 'App.jsx'));

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.metadata.language).toBe('jsx');
    });

    it('генерирует уникальные id', () => {
      const chunker = new TreeSitterChunker(config);
      const content = [
        'function a(): void {}',
        'function b(): void {}',
        'function c(): void {}',
      ].join('\n');
      const result = chunker.chunk(makeFile(content));

      const ids = result.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('contentHash — SHA-256 (64 символа)', () => {
      const chunker = new TreeSitterChunker(config);
      const content = 'function test(): void {}';
      const result = chunker.chunk(makeFile(content));

      expect(result[0]!.contentHash.length).toBe(64);
    });
  });
});
