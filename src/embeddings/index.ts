// Barrel-файл модуля эмбеддингов.
export type { TextEmbedder } from './types.js';

export { JinaTextEmbedder } from './jina.js';
export { OpenAITextEmbedder } from './openai.js';
export { MockTextEmbedder } from './mock.js';
export { createTextEmbedder } from './factory.js';
