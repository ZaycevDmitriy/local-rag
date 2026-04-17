// Barrel-файл модуля summarization.
export type { Summarizer, SummarizerInput, SummarizerResult } from './types.js';
export { MockSummarizer } from './mock.js';
export { SiliconFlowSummarizer } from './siliconflow.js';
export { createSummarizer } from './factory.js';
export { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
export { shouldSummarize, MIN_CONTENT_LENGTH } from './gates.js';
export type { GateDecision } from './gates.js';
