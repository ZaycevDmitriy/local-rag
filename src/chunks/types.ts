import { createHash, randomUUID } from 'node:crypto';

// Содержимое файла для обработки чанкером.
export interface FileContent {
  // Относительный путь файла.
  path: string;
  // Текстовое содержимое.
  content: string;
  // ID источника.
  sourceId: string;
}

// Метаданные чанка — зависят от типа источника.
export interface ChunkMetadata {
  path: string;
  sourceType: 'code' | 'markdown' | 'text' | 'pdf';
  startLine?: number;
  endLine?: number;
  fqn?: string;
  fragmentType?: string;
  language?: string;
  headerPath?: string;
  headerLevel?: number;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
}

// Фрагмент документа с вектором и метаданными.
export interface Chunk {
  // crypto.randomUUID().
  id: string;
  sourceId: string;
  content: string;
  // SHA-256 хэш содержимого.
  contentHash: string;
  metadata: ChunkMetadata;
}

// Интерфейс стратегии разбиения на фрагменты.
export interface Chunker {
  chunk(file: FileContent): Chunk[];
  supports(filePath: string): boolean;
}

// Параметры размера чанков из конфигурации.
export interface ChunkSizeConfig {
  maxTokens: number;
  overlap: number;
}

// Вспомогательная функция создания чанка.
export function createChunk(sourceId: string, content: string, metadata: ChunkMetadata): Chunk {
  return {
    id: randomUUID(),
    sourceId,
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
    metadata,
  };
}
