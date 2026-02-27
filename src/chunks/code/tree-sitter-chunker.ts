import { createRequire } from 'node:module';
import { createChunk } from '../types.js';
import type { Chunk, ChunkMetadata, ChunkSizeConfig, Chunker, FileContent } from '../types.js';
import { getLanguageForFile, isTreeSitterSupported } from './languages.js';
import { extractNodes } from './ts-extractor.js';
import type { ExtractedNode, ExtractorFn } from './extractor-types.js';

const require = createRequire(import.meta.url);

// Приблизительное соотношение символов к токенам.
const CHARS_PER_TOKEN = 4;

// Возвращает функцию-экстрактор узлов для заданного языка.
function getExtractor(langName: string): ExtractorFn {
  switch (langName) {
  case 'typescript':
  case 'tsx':
  case 'javascript':
  case 'jsx':
    return extractNodes;
  case 'java':
  case 'kotlin':
    // Заглушки — реализация в фазах 6-7.
    return () => [];
  default:
    return () => [];
  }
}

// Чанкер для TypeScript/JavaScript с использованием tree-sitter AST.
export class TreeSitterChunker implements Chunker {
  private readonly maxChars: number;
  private readonly overlapChars: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly parsers = new Map<string, any>();

  constructor(config: ChunkSizeConfig) {
    this.maxChars = config.maxTokens * CHARS_PER_TOKEN;
    this.overlapChars = config.overlap * CHARS_PER_TOKEN;
  }

  // Поддерживает .ts, .tsx, .js, .jsx файлы.
  supports(filePath: string): boolean {
    return isTreeSitterSupported(filePath);
  }

  // Возвращает (или создаёт) parser для заданного языка.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getParser(langName: string, language: any): any {
    let parser = this.parsers.get(langName);
    if (!parser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Parser = require('tree-sitter') as any;
      parser = new Parser();
      parser.setLanguage(language);
      this.parsers.set(langName, parser);
    }
    return parser;
  }

  chunk(file: FileContent): Chunk[] {
    if (!file.content.length) {
      return [];
    }

    const langInfo = getLanguageForFile(file.path);
    if (!langInfo) {
      return [];
    }

    // Получаем parser из кэша.
    // bufferSize: буфер tree-sitter должен быть минимум 2x размера контента,
    // иначе для крупных файлов (>16KB сложной вложенности) возникает EINVAL.
    const parser = this.getParser(langInfo.name, langInfo.language);
    const bufferSize = Math.max(file.content.length * 2, 65536);
    const tree = parser.parse(file.content, null, { bufferSize });

    // Извлекаем семантические узлы через маршрутизатор экстракторов.
    const extractor = getExtractor(langInfo.name);
    const extractedNodes = extractor(tree.rootNode);

    // Если узлов нет — весь файл как один code-чанк.
    if (extractedNodes.length === 0) {
      const lines = file.content.split('\n');
      return [createChunk(file.sourceId, file.content, {
        path: file.path,
        sourceType: 'code',
        language: langInfo.name,
        startLine: 1,
        endLine: lines.length,
      })];
    }

    // Создаём чанки из извлечённых узлов.
    const chunks: Chunk[] = [];
    for (const node of extractedNodes) {
      const nodeChunks = this.createChunksFromNode(file, node, langInfo.name);
      chunks.push(...nodeChunks);
    }

    return chunks;
  }

  // Создаёт один или несколько чанков из извлечённого узла.
  private createChunksFromNode(
    file: FileContent,
    node: ExtractedNode,
    language: string,
  ): Chunk[] {
    const { text, fqn, fragmentType, startLine, endLine } = node;

    if (text.length <= this.maxChars) {
      const metadata: ChunkMetadata = {
        path: file.path,
        sourceType: 'code',
        language,
        fqn,
        fragmentType,
        startLine,
        endLine,
      };
      return [createChunk(file.sourceId, text, metadata)];
    }

    // Oversized узел — разрезаем скользящим окном по строкам.
    return this.splitOversizedNode(file, node, language);
  }

  // Разрезает oversized узел скользящим окном по строкам.
  private splitOversizedNode(
    file: FileContent,
    node: ExtractedNode,
    language: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = node.text.split('\n');
    let currentLines: string[] = [];
    let currentLength = 0;
    let chunkStartLine = node.startLine;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);

      if (currentLength + lineLength > this.maxChars && currentLines.length > 0) {
        const content = currentLines.join('\n');
        const endLine = chunkStartLine + currentLines.length - 1;
        const metadata: ChunkMetadata = {
          path: file.path,
          sourceType: 'code',
          language,
          fqn: node.fqn,
          fragmentType: node.fragmentType,
          startLine: chunkStartLine,
          endLine,
        };
        chunks.push(createChunk(file.sourceId, content, metadata));

        // Вычисляем overlap.
        const { overlapLines, overlapLength } = this.computeOverlap(currentLines);
        chunkStartLine = chunkStartLine + currentLines.length - overlapLines.length;
        currentLines = [...overlapLines];
        currentLength = overlapLength;
      }

      currentLines.push(line);
      currentLength += lineLength;
    }

    // Остаток.
    if (currentLines.length > 0) {
      const content = currentLines.join('\n');
      const endLine = chunkStartLine + currentLines.length - 1;
      const metadata: ChunkMetadata = {
        path: file.path,
        sourceType: 'code',
        language,
        fqn: node.fqn,
        fragmentType: node.fragmentType,
        startLine: chunkStartLine,
        endLine,
      };
      chunks.push(createChunk(file.sourceId, content, metadata));
    }

    return chunks;
  }

  // Вычисляет строки для overlap из конца текущего чанка.
  private computeOverlap(lines: string[]): { overlapLines: string[]; overlapLength: number } {
    const overlapLines: string[] = [];
    let overlapLength = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      const lineLen = line.length + 1;
      if (overlapLength + lineLen > this.overlapChars && overlapLines.length > 0) {
        break;
      }
      overlapLines.unshift(line);
      overlapLength += lineLen;
    }

    return { overlapLines, overlapLength };
  }
}
