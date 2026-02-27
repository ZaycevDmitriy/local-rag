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

function makeFile(content: string, path = 'Test.kt'): FileContent {
  return { path, content, sourceId: 'source-1' };
}

describe('Kotlin graceful degradation', () => {
  describe('isTreeSitterSupported для .kt', () => {
    it('возвращает boolean (true если установлен, false если нет)', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const result = isTreeSitterSupported('Test.kt');
      expect(typeof result).toBe('boolean');
    });

    it('warn логируется максимум один раз при нескольких обращениях', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      isTreeSitterSupported('A.kt');
      isTreeSitterSupported('B.kt');
      isTreeSitterSupported('C.kt');

      // Если tree-sitter-kotlin не установлен — warn должен быть ровно один раз (кэш _kotlinLoadFailed).
      if (warnSpy.mock.calls.length > 0) {
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]![0]).toContain('tree-sitter-kotlin');
      }
    });
  });

  describe('setStrictAst с ошибкой загрузки', () => {
    it('strictAst=true + kotlin недоступна → throw Error', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const kotlinAvailable = isTreeSitterSupported('Test.kt');

      if (!kotlinAvailable) {
        // tree-sitter-kotlin не установлен — тестируем strictAst.
        _resetLanguageCache();
        setStrictAst(true);
        expect(() => isTreeSitterSupported('Test.kt')).toThrow('tree-sitter-kotlin');
      }
      // Если kotlin доступна — тест не применим в данной среде.
    });
  });

  describe('ChunkDispatcher при недоступном tree-sitter-kotlin', () => {
    it('.kt файл обрабатывается FallbackChunker если tree-sitter-kotlin недоступен', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const kotlinAvailable = isTreeSitterSupported('Test.kt');

      if (kotlinAvailable) {
        // Пропускаем если kotlin доступна — graceful degradation не проверима в этой среде.
        return;
      }

      // tree-sitter-kotlin недоступен — TreeSitterChunker.supports('.kt') = false.
      // FallbackChunker подхватывает .kt файлы.
      const config = { maxTokens: 500, overlap: 50 };
      const tsChunker = new TreeSitterChunker(config);
      const fallbackChunker = new FallbackChunker(config);
      const fixedChunker = new FixedSizeChunker(config);
      const dispatcher = new ChunkDispatcher([tsChunker, fallbackChunker], fixedChunker);

      const content = [
        'class HelloWorld {',
        '    fun main() {',
        '        println("Hello, World!")',
        '    }',
        '}',
      ].join('\n');

      // TreeSitterChunker не поддерживает .kt (без tree-sitter-kotlin).
      expect(tsChunker.supports('Test.kt')).toBe(false);
      // FallbackChunker поддерживает .kt.
      expect(fallbackChunker.supports('Test.kt')).toBe(true);

      const result = dispatcher.chunk(makeFile(content));
      // FallbackChunker должен вернуть хотя бы один чанк.
      expect(result.length).toBeGreaterThan(0);
      // Чанк не должен иметь fragmentType (это fallback, не AST-чанк).
      expect(result[0]!.metadata.fragmentType).toBeUndefined();
    });

    it('FallbackChunker поддерживает .kt файлы', () => {
      const config = { maxTokens: 500, overlap: 50 };
      const fallbackChunker = new FallbackChunker(config);
      expect(fallbackChunker.supports('Main.kt')).toBe(true);
      expect(fallbackChunker.supports('Test.kt')).toBe(true);
    });
  });
});
