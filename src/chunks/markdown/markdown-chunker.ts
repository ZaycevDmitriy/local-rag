import { createChunk } from '../types.js';
import type { Chunk, ChunkMetadata, ChunkSizeConfig, Chunker, FileContent } from '../types.js';

// Приблизительное соотношение символов к токенам.
const CHARS_PER_TOKEN = 4;

// Регулярка для определения заголовка markdown.
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

// Элемент стека заголовков.
interface HeaderEntry {
  level: number;
  text: string;
}

// Накопленная секция markdown.
interface Section {
  headerStack: HeaderEntry[];
  headerLevel: number;
  lines: string[];
  startLine: number;
}

// Чанкер для markdown-файлов. Разбивает по заголовкам.
export class MarkdownChunker implements Chunker {
  private readonly maxChars: number;
  private readonly overlapChars: number;
  private readonly maxTokens: number;
  private readonly overlap: number;

  constructor(config: ChunkSizeConfig) {
    this.maxTokens = config.maxTokens;
    this.overlap = config.overlap;
    this.maxChars = config.maxTokens * CHARS_PER_TOKEN;
    this.overlapChars = config.overlap * CHARS_PER_TOKEN;
  }

  // Поддерживает .md и .mdx файлы.
  supports(filePath: string): boolean {
    return /\.(md|mdx)$/i.test(filePath);
  }

  chunk(file: FileContent): Chunk[] {
    if (!file.content.length) {
      return [];
    }

    const sections = this.splitSections(file.content);
    const chunks: Chunk[] = [];

    for (const section of sections) {
      const content = section.lines.join('\n');
      if (!content.trim().length) {
        continue;
      }

      const headerPath = this.buildHeaderPath(section.headerStack);

      // Если секция превышает лимит — разрезаем скользящим окном.
      if (content.length > this.maxChars) {
        const subChunks = this.splitOversizedSection(
          file,
          section,
          headerPath,
        );
        chunks.push(...subChunks);
      } else {
        const endLine = section.startLine + section.lines.length - 1;
        const metadata: ChunkMetadata = {
          path: file.path,
          sourceType: 'markdown',
          startLine: section.startLine,
          endLine,
          headerPath: headerPath || undefined,
          headerLevel: section.headerLevel || undefined,
        };
        chunks.push(createChunk(file.sourceId, content, metadata));
      }
    }

    return chunks;
  }

  // Разбивает содержимое на секции по заголовкам.
  private splitSections(content: string): Section[] {
    const lines = content.split('\n');
    const sections: Section[] = [];
    const headerStack: HeaderEntry[] = [];
    let currentLines: string[] = [];
    let currentStartLine = 1;
    let currentHeaderLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = HEADING_REGEX.exec(line);

      if (match) {
        const level = match[1]!.length;
        const text = match[2]!.trim();

        // Сохраняем текущую секцию, если есть содержимое.
        if (currentLines.length > 0) {
          sections.push({
            headerStack: [...headerStack],
            headerLevel: currentHeaderLevel,
            lines: currentLines,
            startLine: currentStartLine,
          });
        }

        // Обновляем стек заголовков: убираем все заголовки >= текущего уровня.
        while (headerStack.length > 0 && headerStack[headerStack.length - 1]!.level >= level) {
          headerStack.pop();
        }
        headerStack.push({ level, text: `${'#'.repeat(level)} ${text}` });

        currentLines = [line];
        currentStartLine = i + 1;
        currentHeaderLevel = level;
      } else {
        currentLines.push(line);
      }
    }

    // Последняя секция.
    if (currentLines.length > 0) {
      sections.push({
        headerStack: [...headerStack],
        headerLevel: currentHeaderLevel,
        lines: currentLines,
        startLine: currentStartLine,
      });
    }

    return sections;
  }

  // Формирует путь заголовков: "# API > ## Auth > ### JWT".
  private buildHeaderPath(stack: HeaderEntry[]): string {
    return stack.map(h => h.text).join(' > ');
  }

  // Разрезает секцию, превышающую maxChars, скользящим окном по строкам.
  private splitOversizedSection(
    file: FileContent,
    section: Section,
    headerPath: string,
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = section.lines;
    let currentLines: string[] = [];
    let currentLength = 0;
    let chunkStartLine = section.startLine;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);

      if (currentLength + lineLength > this.maxChars && currentLines.length > 0) {
        const content = currentLines.join('\n');
        const endLine = chunkStartLine + currentLines.length - 1;
        const metadata: ChunkMetadata = {
          path: file.path,
          sourceType: 'markdown',
          startLine: chunkStartLine,
          endLine,
          headerPath: headerPath || undefined,
          headerLevel: section.headerLevel || undefined,
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
        sourceType: 'markdown',
        startLine: chunkStartLine,
        endLine,
        headerPath: headerPath || undefined,
        headerLevel: section.headerLevel || undefined,
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
