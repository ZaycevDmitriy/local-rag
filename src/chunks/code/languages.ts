import { createRequire } from 'node:module';
import { extname } from 'node:path';

const require = createRequire(import.meta.url);

// Типы из tree-sitter (не экспортируем напрямую, используем any для языков).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterLanguage = any;

// Ленивая загрузка языков tree-sitter.
let _tsLanguages: { typescript: TreeSitterLanguage; tsx: TreeSitterLanguage } | null = null;
let _jsLanguage: TreeSitterLanguage | null = null;

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
  default:
    return null;
  }
}

// Проверяет, поддерживается ли файл tree-sitter (TS/JS).
export function isTreeSitterSupported(filePath: string): boolean {
  return getLanguageForFile(filePath) !== null;
}
