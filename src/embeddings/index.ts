// Barrel-файл модуля эмбеддингов.
export type { TextEmbedder } from './types.js';

export { JinaTextEmbedder } from './jina.js';
export { MockTextEmbedder } from './mock.js';
export { createTextEmbedder } from './factory.js';
