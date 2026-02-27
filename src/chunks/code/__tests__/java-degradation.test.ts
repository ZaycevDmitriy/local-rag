import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetLanguageCache, isTreeSitterSupported, setStrictAst } from '../languages.js';
import { ChunkDispatcher } from '../../dispatcher.js';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import { FallbackChunker } from '../fallback-chunker.js';
import { FixedSizeChunker } from '../../text/fixed-chunker.js';
import type { FileContent } from '../../types.js';

beforeEach(() => {
  _resetLanguageCache();
  vi.restoreAllMocks();
});

function makeFile(content: string, path = 'Test.java'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('Java graceful degradation', () => {
  describe('isTreeSitterSupported для .java', () => {
    it('возвращает boolean (true если установлен, false если нет)', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const result = isTreeSitterSupported('Test.java');
      expect(typeof result).toBe('boolean');
    });

    it('warn логируется максимум один раз при нескольких обращениях', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      isTreeSitterSupported('A.java');
      isTreeSitterSupported('B.java');
      isTreeSitterSupported('C.java');

      // Если tree-sitter-java не установлен — warn должен быть ровно один раз (кэш _javaLoadFailed).
      if (warnSpy.mock.calls.length > 0) {
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]![0]).toContain('tree-sitter-java');
      }
    });
  });

  describe('setStrictAst с ошибкой загрузки', () => {
    it('strictAst=true + java недоступна → throw Error', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const javaAvailable = isTreeSitterSupported('Test.java');

      if (!javaAvailable) {
        // tree-sitter-java не установлен — тестируем strictAst.
        _resetLanguageCache();
        setStrictAst(true);
        expect(() => isTreeSitterSupported('Test.java')).toThrow('tree-sitter-java');
      }
      // Если java доступна — тест не применим в данной среде.
    });
  });

  describe('ChunkDispatcher при недоступном tree-sitter-java', () => {
    it('.java файл обрабатывается FallbackChunker если tree-sitter-java недоступен', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const javaAvailable = isTreeSitterSupported('Test.java');

      if (javaAvailable) {
        // Пропускаем если java доступна — graceful degradation не проверима в этой среде.
        return;
      }

      // tree-sitter-java недоступен — TreeSitterChunker.supports('.java') = false.
      // FallbackChunker подхватывает .java файлы.
      const config = { maxTokens: 500, overlap: 50 };
      const tsChunker = new TreeSitterChunker(config);
      const fallbackChunker = new FallbackChunker(config);
      const fixedChunker = new FixedSizeChunker(config);
      const dispatcher = new ChunkDispatcher([tsChunker, fallbackChunker], fixedChunker);

      const content = [
        'public class HelloWorld {',
        '    public static void main(String[] args) {',
        '        System.out.println("Hello, World!");',
        '    }',
        '}',
      ].join('\n');

      // TreeSitterChunker не поддерживает .java (без tree-sitter-java).
      expect(tsChunker.supports('Test.java')).toBe(false);
      // FallbackChunker поддерживает .java.
      expect(fallbackChunker.supports('Test.java')).toBe(true);

      const result = dispatcher.chunk(makeFile(content));
      // FallbackChunker должен вернуть хотя бы один чанк.
      expect(result.length).toBeGreaterThan(0);
      // Чанк не должен иметь fragmentType (это fallback, не AST-чанк).
      expect(result[0]!.metadata.fragmentType).toBeUndefined();
    });

    it('FallbackChunker поддерживает .java файлы', () => {
      const config = { maxTokens: 500, overlap: 50 };
      const fallbackChunker = new FallbackChunker(config);
      expect(fallbackChunker.supports('Main.java')).toBe(true);
      expect(fallbackChunker.supports('Test.java')).toBe(true);
    });
  });
});
