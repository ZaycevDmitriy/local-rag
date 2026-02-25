import { describe, it, expect } from 'vitest';
import { FixedSizeChunker } from '../text/fixed-chunker.js';
import type { FileContent } from '../types.js';

// Конфигурация: 50 токенов = 200 символов, overlap 10 токенов = 40 символов.
const config = { maxTokens: 50, overlap: 10 };

function makeFile(content: string, path = 'test.txt'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('FixedSizeChunker', () => {
  it('поддерживает все файлы (fallback чанкер)', () => {
    const chunker = new FixedSizeChunker(config);
    expect(chunker.supports('file.txt')).toBe(true);
    expect(chunker.supports('file.ts')).toBe(true);
    expect(chunker.supports('file.md')).toBe(true);
    expect(chunker.supports('anything')).toBe(true);
  });

  it('возвращает пустой массив для пустого файла', () => {
    const chunker = new FixedSizeChunker(config);
    const result = chunker.chunk(makeFile(''));
    expect(result).toEqual([]);
  });

  it('возвращает один чанк для короткого файла', () => {
    const chunker = new FixedSizeChunker(config);
    const content = 'Short content';
    const result = chunker.chunk(makeFile(content));

    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe(content);
    expect(result[0]!.sourceId).toBe('source-1');
    expect(result[0]!.metadata.sourceType).toBe('text');
    expect(result[0]!.metadata.path).toBe('test.txt');
    expect(result[0]!.metadata.startOffset).toBe(0);
    expect(result[0]!.metadata.endOffset).toBe(content.length);
  });

  it('разбивает длинный файл на несколько чанков с overlap', () => {
    // maxTokens=50 -> 200 символов. Создаём контент > 200 символов.
    const chunker = new FixedSizeChunker(config);
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`Line ${i}: ${'x'.repeat(10)}`);
    }
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content));

    // Должно быть больше одного чанка.
    expect(result.length).toBeGreaterThan(1);

    // Все чанки должны иметь корректные метаданные.
    for (const chunk of result) {
      expect(chunk.metadata.sourceType).toBe('text');
      expect(chunk.metadata.startOffset).toBeDefined();
      expect(chunk.metadata.endOffset).toBeDefined();
      expect(chunk.metadata.startOffset!).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.endOffset!).toBeGreaterThan(chunk.metadata.startOffset!);
    }

    // Первый чанк начинается с 0.
    expect(result[0]!.metadata.startOffset).toBe(0);
  });

  it('генерирует уникальные id и contentHash для каждого чанка', () => {
    const chunker = new FixedSizeChunker(config);
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`Line ${i}: ${'x'.repeat(10)}`);
    }
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content));

    const ids = result.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // contentHash должен быть непустой строкой.
    for (const chunk of result) {
      expect(chunk.contentHash).toBeTruthy();
      expect(chunk.contentHash.length).toBe(64); // SHA-256 hex.
    }
  });

  it('overlap: второй чанк содержит часть контента из первого', () => {
    // Используем маленький maxTokens для простоты проверки.
    const smallConfig = { maxTokens: 25, overlap: 5 };
    const chunker = new FixedSizeChunker(smallConfig);

    // 25 токенов = 100 символов, overlap = 5 токенов = 20 символов.
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`L${i.toString().padStart(2, '0')}: data`);
    }
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content));

    if (result.length >= 2) {
      // Второй чанк должен начинаться раньше, чем заканчивается первый (overlap).
      expect(result[1]!.metadata.startOffset!).toBeLessThan(result[0]!.metadata.endOffset!);
    }
  });

  it('startOffset и endOffset покрывают весь файл', () => {
    const chunker = new FixedSizeChunker(config);
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`Line ${i}: ${'x'.repeat(10)}`);
    }
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content));

    // Первый чанк начинается с 0.
    expect(result[0]!.metadata.startOffset).toBe(0);
    // Последний чанк заканчивается на длине контента.
    expect(result[result.length - 1]!.metadata.endOffset).toBe(content.length);
  });
});
