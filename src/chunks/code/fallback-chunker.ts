import { extname } from 'node:path';
import { createChunk } from '../types.js';
import type { Chunk, ChunkMetadata, ChunkSizeConfig, Chunker, FileContent } from '../types.js';

// Приблизительное соотношение символов к токенам.
const CHARS_PER_TOKEN = 4;

// Минимальное число последовательных пустых строк для разделения блоков.
const BLOCK_SEPARATOR_LINES = 2;

// Маппинг расширений на имена языков.
const EXTENSION_LANGUAGE: Record<string, string> = {
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
};

// Блок текста с координатами строк (1-based).
interface TextBlock {
  lines: string[];
  startLine: number;
  endLine: number;
}

// Текстовый чанкер для языков без tree-sitter поддержки.
// Разбивает по двойным переносам строк, группирует блоки до maxChars.
export class FallbackChunker implements Chunker {
  private readonly maxChars: number;
  private readonly overlapChars: number;

  constructor(config: ChunkSizeConfig) {
    this.maxChars = config.maxTokens * CHARS_PER_TOKEN;
    this.overlapChars = config.overlap * CHARS_PER_TOKEN;
  }

  // Поддерживает языки без tree-sitter: py, go, rs, java и др.
  supports(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext in EXTENSION_LANGUAGE;
  }

  chunk(file: FileContent): Chunk[] {
    if (!file.content.length) {
      return [];
    }

    const language = EXTENSION_LANGUAGE[extname(file.path).toLowerCase()];
    if (!language) {
      return [];
    }

    // Разбиваем содержимое на блоки, отслеживая номера строк.
    const blocks = this.splitIntoBlocks(file.content);
    if (blocks.length === 0) {
      return [];
    }

    // Группируем блоки в чанки.
    return this.groupBlocksIntoChunks(file, blocks, language);
  }

  // Разбивает контент на смысловые блоки, разделённые 2+ пустыми строками.
  private splitIntoBlocks(content: string): TextBlock[] {
    const lines = content.split('\n');
    const blocks: TextBlock[] = [];
    let currentLines: string[] = [];
    let currentStartLine = 1;
    let blankCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1; // 1-based

      if (line.trim() === '') {
        blankCount++;

        if (blankCount >= BLOCK_SEPARATOR_LINES && currentLines.length > 0) {
          // Достигли разделителя — сохраняем текущий блок.
          blocks.push({
            lines: [...currentLines],
            startLine: currentStartLine,
            endLine: lineNum - blankCount,
          });
          currentLines = [];
          currentStartLine = lineNum + 1;
        }
      } else {
        // Непустая строка.
        if (blankCount > 0 && currentLines.length === 0) {
          // Начало нового блока после разделителя.
          currentStartLine = lineNum;
        }
        blankCount = 0;
        currentLines.push(line);
      }
    }

    // Последний блок.
    if (currentLines.length > 0) {
      blocks.push({
        lines: currentLines,
        startLine: currentStartLine,
        endLine: currentStartLine + currentLines.length - 1,
      });
    }

    return blocks;
  }

  // Группирует блоки в чанки, соблюдая maxChars.
  private groupBlocksIntoChunks(file: FileContent, blocks: TextBlock[], language: string): Chunk[] {
    const chunks: Chunk[] = [];
    let currentBlocks: TextBlock[] = [];
    let currentLength = 0;

    for (const block of blocks) {
      const blockContent = block.lines.join('\n');

      // Oversized блок — обрабатываем отдельно.
      if (blockContent.length > this.maxChars) {
        if (currentBlocks.length > 0) {
          chunks.push(...this.buildChunksFromGroup(file, currentBlocks, language));
          currentBlocks = [];
          currentLength = 0;
        }
        const oversizedChunks = this.splitOversizedBlock(file, block, language);
        chunks.push(...oversizedChunks);
        continue;
      }

      // Если добавление блока превысит лимит — сбрасываем текущее.
      if (currentLength > 0 && currentLength + blockContent.length > this.maxChars) {
        chunks.push(...this.buildChunksFromGroup(file, currentBlocks, language));
        currentBlocks = [];
        currentLength = 0;
      }

      currentBlocks.push(block);
      // +1 для разделителя между блоками (\n\n).
      currentLength += blockContent.length + (currentBlocks.length > 1 ? 1 : 0);
    }

    // Остаток.
    if (currentBlocks.length > 0) {
      chunks.push(...this.buildChunksFromGroup(file, currentBlocks, language));
    }

    return chunks;
  }

  // Создаёт чанки из группы блоков.
  private buildChunksFromGroup(file: FileContent, blocks: TextBlock[], language: string): Chunk[] {
    const content = blocks.map(b => b.lines.join('\n')).join('\n\n');
    const startLine = blocks[0]!.startLine;
    const endLine = blocks[blocks.length - 1]!.endLine;
    return [this.buildChunk(file, content, language, startLine, endLine)];
  }

  // Разрезает oversized блок скользящим окном по строкам.
  private splitOversizedBlock(file: FileContent, block: TextBlock, language: string): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = block.lines;
    let currentLines: string[] = [];
    let currentLength = 0;
    let chunkStartLine = block.startLine;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);

      if (currentLength + lineLength > this.maxChars && currentLines.length > 0) {
        const content = currentLines.join('\n');
        const endLine = chunkStartLine + currentLines.length - 1;
        chunks.push(this.buildChunk(file, content, language, chunkStartLine, endLine));

        // Overlap.
        const { overlapLines, overlapLength } = this.computeOverlap(currentLines);
        chunkStartLine = chunkStartLine + currentLines.length - overlapLines.length;
        currentLines = [...overlapLines];
        currentLength = overlapLength;
      }

      currentLines.push(line);
      currentLength += lineLength;
    }

    if (currentLines.length > 0) {
      const content = currentLines.join('\n');
      const endLine = chunkStartLine + currentLines.length - 1;
      chunks.push(this.buildChunk(file, content, language, chunkStartLine, endLine));
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

  // Создаёт чанк с метаданными типа code.
  private buildChunk(
    file: FileContent,
    content: string,
    language: string,
    startLine: number,
    endLine: number,
  ): Chunk {
    const metadata: ChunkMetadata = {
      path: file.path,
      sourceType: 'code',
      language,
      startLine,
      endLine,
    };
    return createChunk(file.sourceId, content, metadata);
  }
}
