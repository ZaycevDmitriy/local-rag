import { describe, it, expect } from 'vitest';
import { ChunkDispatcher } from '../dispatcher.js';
import { MarkdownChunker } from '../markdown/markdown-chunker.js';
import { FixedSizeChunker } from '../text/fixed-chunker.js';
import type { Chunk, Chunker, FileContent } from '../types.js';

const config = { maxTokens: 500, overlap: 50 };

function makeFile(content: string, path: string): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('ChunkDispatcher', () => {
  it('выбирает MarkdownChunker для .md файлов', () => {
    const mdChunker = new MarkdownChunker(config);
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([mdChunker], fallback);

    const file = makeFile('# Title\nText.', 'readme.md');
    const result = dispatcher.chunk(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.sourceType).toBe('markdown');
  });

  it('выбирает MarkdownChunker для .mdx файлов', () => {
    const mdChunker = new MarkdownChunker(config);
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([mdChunker], fallback);

    const file = makeFile('# Title\nText.', 'page.mdx');
    const result = dispatcher.chunk(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.sourceType).toBe('markdown');
  });

  it('выбирает fallback для неизвестных расширений', () => {
    const mdChunker = new MarkdownChunker(config);
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([mdChunker], fallback);

    const file = makeFile('Some plain text content.', 'notes.txt');
    const result = dispatcher.chunk(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.sourceType).toBe('text');
  });

  it('выбирает fallback для .ts файлов (когда нет code-чанкера)', () => {
    const mdChunker = new MarkdownChunker(config);
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([mdChunker], fallback);

    const file = makeFile('const x = 1;', 'index.ts');
    const result = dispatcher.chunk(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.sourceType).toBe('text');
  });

  it('первый подходящий chunker выигрывает', () => {
    // Создаём два чанкера, оба поддерживают .md.
    const first: Chunker = {
      supports: (path: string) => path.endsWith('.md'),
      chunk: (file: FileContent): Chunk[] => [{
        id: 'first-chunker',
        sourceId: file.sourceId,
        content: file.content,
        contentHash: 'hash',
        metadata: { path: file.path, sourceType: 'markdown' },
      }],
    };
    const second: Chunker = {
      supports: (path: string) => path.endsWith('.md'),
      chunk: (file: FileContent): Chunk[] => [{
        id: 'second-chunker',
        sourceId: file.sourceId,
        content: file.content,
        contentHash: 'hash',
        metadata: { path: file.path, sourceType: 'markdown' },
      }],
    };
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([first, second], fallback);

    const file = makeFile('# Test', 'test.md');
    const result = dispatcher.chunk(file);

    expect(result[0]!.id).toBe('first-chunker');
  });

  it('работает с пустым списком chunkers — использует fallback', () => {
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([], fallback);

    const file = makeFile('Content.', 'file.md');
    const result = dispatcher.chunk(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.metadata.sourceType).toBe('text');
  });

  it('обрабатывает пустой файл через выбранный чанкер', () => {
    const mdChunker = new MarkdownChunker(config);
    const fallback = new FixedSizeChunker(config);
    const dispatcher = new ChunkDispatcher([mdChunker], fallback);

    const file = makeFile('', 'empty.md');
    const result = dispatcher.chunk(file);

    expect(result).toEqual([]);
  });
});
