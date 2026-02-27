import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLanguageForFile, isTreeSitterSupported, _resetLanguageCache } from '../languages.js';

beforeEach(() => {
  _resetLanguageCache();
});

describe('getLanguageForFile', () => {
  it('возвращает typescript для .ts', () => {
    const info = getLanguageForFile('src/index.ts');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('typescript');
  });

  it('возвращает tsx для .tsx', () => {
    const info = getLanguageForFile('Component.tsx');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('tsx');
  });

  it('возвращает javascript для .js', () => {
    const info = getLanguageForFile('app.js');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('javascript');
  });

  it('возвращает jsx для .jsx', () => {
    const info = getLanguageForFile('App.jsx');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('jsx');
  });

  it('возвращает null для неизвестных расширений', () => {
    expect(getLanguageForFile('README.md')).toBeNull();
    expect(getLanguageForFile('data.json')).toBeNull();
    expect(getLanguageForFile('style.css')).toBeNull();
  });

  it('возвращает null для .java если tree-sitter-java не установлен', () => {
    // tree-sitter-java не установлен в проекте — ожидаем graceful degradation.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = getLanguageForFile('Main.java');
    // Если пакет не установлен — null, иначе возвращает info.
    if (info === null) {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('tree-sitter-java'),
      );
    } else {
      expect(info.name).toBe('java');
    }
    warnSpy.mockRestore();
  });

  it('возвращает null для .kt если tree-sitter-kotlin не установлен', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = getLanguageForFile('Main.kt');
    if (info === null) {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('tree-sitter-kotlin'),
      );
    } else {
      expect(info.name).toBe('kotlin');
    }
    warnSpy.mockRestore();
  });

  it('возвращает null для .kts если tree-sitter-kotlin не установлен', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = getLanguageForFile('build.kts');
    if (info === null) {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('tree-sitter-kotlin'),
      );
    } else {
      expect(info.name).toBe('kotlin');
    }
    warnSpy.mockRestore();
  });

  it('warn выводится только один раз при повторных вызовах для java', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getLanguageForFile('A.java');
    getLanguageForFile('B.java');
    getLanguageForFile('C.java');
    // Если пакет не установлен — warn должен быть только 1 раз (кэш _javaLoadFailed).
    if (warnSpy.mock.calls.length > 0) {
      expect(warnSpy).toHaveBeenCalledTimes(1);
    }
    warnSpy.mockRestore();
  });
});

describe('isTreeSitterSupported', () => {
  it('возвращает true для .ts/.tsx/.js/.jsx', () => {
    expect(isTreeSitterSupported('index.ts')).toBe(true);
    expect(isTreeSitterSupported('App.tsx')).toBe(true);
    expect(isTreeSitterSupported('main.js')).toBe(true);
    expect(isTreeSitterSupported('App.jsx')).toBe(true);
  });

  it('возвращает false для .md/.json/.css', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(isTreeSitterSupported('README.md')).toBe(false);
    expect(isTreeSitterSupported('data.json')).toBe(false);
    expect(isTreeSitterSupported('style.css')).toBe(false);
  });
});
