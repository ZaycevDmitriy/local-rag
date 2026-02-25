import { createChunk } from '../types.js';
import type { Chunk, ChunkMetadata, ChunkSizeConfig, Chunker, FileContent } from '../types.js';

// Приблизительное соотношение символов к токенам.
const CHARS_PER_TOKEN = 4;

// Чанкер со скользящим окном фиксированного размера.
// Используется как fallback для всех типов файлов.
export class FixedSizeChunker implements Chunker {
  private readonly maxChars: number;
  private readonly overlapChars: number;

  constructor(config: ChunkSizeConfig) {
    this.maxChars = config.maxTokens * CHARS_PER_TOKEN;
    this.overlapChars = config.overlap * CHARS_PER_TOKEN;
  }

  // Поддерживает все файлы — это fallback-чанкер.
  supports(_filePath: string): boolean {
    return true;
  }

  chunk(file: FileContent): Chunk[] {
    if (!file.content.length) {
      return [];
    }

    // Если весь контент помещается в один чанк.
    if (file.content.length <= this.maxChars) {
      return [this.buildChunk(file, file.content, 0, file.content.length)];
    }

    return this.splitByLines(file);
  }

  // Разбивает содержимое по строкам, накапливая до maxChars.
  private splitByLines(file: FileContent): Chunk[] {
    const chunks: Chunk[] = [];
    const lines = file.content.split('\n');
    let currentLines: string[] = [];
    let currentLength = 0;
    let chunkStartOffset = 0;
    // Смещение в исходном файле для текущей строки.
    let lineOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // +1 для символа новой строки (кроме последней строки).
      const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);

      // Если добавление строки превысит лимит и уже есть контент.
      if (currentLength + lineLength > this.maxChars && currentLines.length > 0) {
        const content = currentLines.join('\n');
        chunks.push(this.buildChunk(file, content, chunkStartOffset, chunkStartOffset + content.length));

        // Вычисляем overlap: берём строки с конца текущего чанка.
        const { overlapLines, overlapLength } = this.computeOverlap(currentLines);
        currentLines = [...overlapLines];
        currentLength = overlapLength;
        chunkStartOffset = lineOffset - overlapLength;
      }

      currentLines.push(line);
      currentLength += lineLength;
      lineOffset += lineLength;
    }

    // Остаток.
    if (currentLines.length > 0) {
      const content = currentLines.join('\n');
      chunks.push(this.buildChunk(file, content, chunkStartOffset, chunkStartOffset + content.length));
    }

    return chunks;
  }

  // Вычисляет строки для overlap из конца текущего чанка.
  private computeOverlap(lines: string[]): { overlapLines: string[]; overlapLength: number } {
    const overlapLines: string[] = [];
    let overlapLength = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      const lineLen = line.length + 1; // +1 для \n.
      if (overlapLength + lineLen > this.overlapChars && overlapLines.length > 0) {
        break;
      }
      overlapLines.unshift(line);
      overlapLength += lineLen;
    }

    return { overlapLines, overlapLength };
  }

  // Создаёт чанк с метаданными типа text.
  private buildChunk(file: FileContent, content: string, startOffset: number, endOffset: number): Chunk {
    const metadata: ChunkMetadata = {
      path: file.path,
      sourceType: 'text',
      startOffset,
      endOffset,
    };
    return createChunk(file.sourceId, content, metadata);
  }
}
