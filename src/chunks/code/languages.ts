import { createRequire } from 'node:module';
import { extname } from 'node:path';

const require = createRequire(import.meta.url);

// Типы из tree-sitter (не экспортируем напрямую, используем any для языков).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterLanguage = any;

// Флаг строгого режима: если true — бросает ошибку при неудачной загрузке грамматики.
let _strictAst = false;

// Ленивая загрузка языков tree-sitter.
let _tsLanguages: { typescript: TreeSitterLanguage; tsx: TreeSitterLanguage } | null = null;
let _jsLanguage: TreeSitterLanguage | null = null;
let _javaLanguage: TreeSitterLanguage | null = null;
let _javaLoadFailed = false;
let _kotlinLanguage: TreeSitterLanguage | null = null;
let _kotlinLoadFailed = false;

function getTsLanguages(): { typescript: TreeSitterLanguage; tsx: TreeSitterLanguage } {
  if (!_tsLanguages) {
    _tsLanguages = require('tree-sitter-typescript');
  }
  return _tsLanguages!;
}

function getJsLanguage(): TreeSitterLanguage {
  if (!_jsLanguage) {
    _jsLanguage = require('tree-sitter-javascript');
  }
  return _jsLanguage;
}

function getJavaLanguage(): TreeSitterLanguage | null {
  if (_javaLoadFailed) {
    return null;
  }
  if (!_javaLanguage) {
    try {
      _javaLanguage = require('tree-sitter-java');
    } catch {
      if (_strictAst) {
        throw new Error('tree-sitter-java не установлен. Установите: npm install tree-sitter-java');
      }
      console.warn('tree-sitter-java не установлен, .java файлы будут обработаны FallbackChunker.');
      _javaLoadFailed = true;
      return null;
    }
  }
  return _javaLanguage;
}

function getKotlinLanguage(): TreeSitterLanguage | null {
  if (_kotlinLoadFailed) {
    return null;
  }
  if (!_kotlinLanguage) {
    try {
      _kotlinLanguage = require('tree-sitter-kotlin');
    } catch {
      if (_strictAst) {
        throw new Error('tree-sitter-kotlin не установлен. Установите: npm install tree-sitter-kotlin');
      }
      console.warn('tree-sitter-kotlin не установлен, .kt/.kts файлы будут обработаны FallbackChunker.');
      _kotlinLoadFailed = true;
      return null;
    }
  }
  return _kotlinLanguage;
}

// Маппинг расширения -> tree-sitter Language и имя языка.
export interface LanguageInfo {
  language: TreeSitterLanguage;
  // Имя языка для метаданных чанка.
  name: string;
}

// Возвращает информацию о языке для файла по расширению.
export function getLanguageForFile(filePath: string): LanguageInfo | null {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
  case '.ts':
    return { language: getTsLanguages().typescript, name: 'typescript' };
  case '.tsx':
    return { language: getTsLanguages().tsx, name: 'tsx' };
  case '.js':
    return { language: getJsLanguage(), name: 'javascript' };
  case '.jsx':
    return { language: getJsLanguage(), name: 'jsx' };
  case '.java': {
    const javaLang = getJavaLanguage();
    return javaLang ? { language: javaLang, name: 'java' } : null;
  }
  case '.kt':
  case '.kts': {
    const kotlinLang = getKotlinLanguage();
    return kotlinLang ? { language: kotlinLang, name: 'kotlin' } : null;
  }
  default:
    return null;
  }
}

// Проверяет, поддерживается ли файл tree-sitter.
export function isTreeSitterSupported(filePath: string): boolean {
  return getLanguageForFile(filePath) !== null;
}

// Устанавливает режим строгой загрузки грамматик.
export function setStrictAst(value: boolean): void {
  _strictAst = value;
}

// Сбрасывает кэш языков (для тестов).
export function _resetLanguageCache(): void {
  _tsLanguages = null;
  _jsLanguage = null;
  _javaLanguage = null;
  _javaLoadFailed = false;
  _kotlinLanguage = null;
  _kotlinLoadFailed = false;
  _strictAst = false;
}
