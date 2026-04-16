// E2E-тесты ts-extractor через TreeSitterChunker: реальный парсинг и проверка
// извлечённых фрагментов через chunk.metadata (fqn/fragmentType).
import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import type { FileContent, Chunk } from '../../types.js';

const config = { maxTokens: 500, overlap: 50 };

function makeFile(content: string, path = 'index.ts'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

function findByFqn(chunks: Chunk[], fqn: string): Chunk | undefined {
  return chunks.find((c) => c.metadata.fqn === fqn);
}

describe('ts-extractor: generator functions', () => {
  it('function* myGen() {} извлекается как FUNCTION с FQN mySaga', () => {
    const chunker = new TreeSitterChunker(config);
    const content = `
function* mySaga() {
  yield 1;
  yield 2;
}
`;
    const chunks = chunker.chunk(makeFile(content));
    const saga = findByFqn(chunks, 'mySaga');

    expect(saga).toBeDefined();
    expect(saga!.metadata.fragmentType).toBe('FUNCTION');
    expect(saga!.metadata.language).toBe('typescript');
  });

  it('export function* извлекается через export_statement', () => {
    const chunker = new TreeSitterChunker(config);
    const content = `
export function* fetchUsers() {
  yield 'user';
}
`;
    const chunks = chunker.chunk(makeFile(content));
    const fetchUsers = findByFqn(chunks, 'fetchUsers');

    expect(fetchUsers).toBeDefined();
    expect(fetchUsers!.metadata.fragmentType).toBe('FUNCTION');
  });

  it('обычная функция извлекается (regression guard)', () => {
    const chunker = new TreeSitterChunker(config);
    const content = 'function myFunc() { return 42; }';
    const chunks = chunker.chunk(makeFile(content));
    const myFunc = findByFqn(chunks, 'myFunc');

    expect(myFunc).toBeDefined();
    expect(myFunc!.metadata.fragmentType).toBe('FUNCTION');
  });

  it('const + function* извлекается как FUNCTION', () => {
    const chunker = new TreeSitterChunker(config);
    const content = `
export const sagaWatcher = function* () {
  yield 1;
};
`;
    const chunks = chunker.chunk(makeFile(content));
    const saga = findByFqn(chunks, 'sagaWatcher');

    expect(saga).toBeDefined();
    expect(saga!.metadata.fragmentType).toBe('FUNCTION');
  });

  it('множественные generator-функции в файле извлекаются раздельно', () => {
    const chunker = new TreeSitterChunker(config);
    const content = `
function* first() { yield 1; }
function* second() { yield 2; }
export function* third() { yield 3; }
`;
    const chunks = chunker.chunk(makeFile(content));

    expect(findByFqn(chunks, 'first')).toBeDefined();
    expect(findByFqn(chunks, 'second')).toBeDefined();
    expect(findByFqn(chunks, 'third')).toBeDefined();
  });
});

describe('ts-extractor: namespace recursion', () => {
  it('функции внутри namespace извлекаются через recursion в default case', () => {
    const chunker = new TreeSitterChunker(config);
    const content = `
namespace Foo {
  export function bar() { return 1; }
  export function baz() { return 2; }
}
`;
    const chunks = chunker.chunk(makeFile(content));
    // Tree-sitter может дать FQN 'bar' или 'Foo.bar' в зависимости от контекста.
    const bar = chunks.find((c) => c.metadata.fqn === 'bar' || c.metadata.fqn === 'Foo.bar');
    const baz = chunks.find((c) => c.metadata.fqn === 'baz' || c.metadata.fqn === 'Foo.baz');

    expect(bar).toBeDefined();
    expect(baz).toBeDefined();
  });
});

describe('ts-extractor: arrow functions (regression)', () => {
  it('export const name = () => {} извлекается как FUNCTION', () => {
    const chunker = new TreeSitterChunker(config);
    const content = 'export const myArrow = () => { return 1; };';
    const chunks = chunker.chunk(makeFile(content));
    const arrow = findByFqn(chunks, 'myArrow');

    expect(arrow).toBeDefined();
    expect(arrow!.metadata.fragmentType).toBe('FUNCTION');
  });

  it('const name = function() {} извлекается как FUNCTION', () => {
    const chunker = new TreeSitterChunker(config);
    const content = 'const classicFn = function() { return 1; };';
    const chunks = chunker.chunk(makeFile(content));
    const fn = findByFqn(chunks, 'classicFn');

    expect(fn).toBeDefined();
    expect(fn!.metadata.fragmentType).toBe('FUNCTION');
  });
});
