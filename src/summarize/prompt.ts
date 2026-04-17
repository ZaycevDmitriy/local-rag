// Prompt builder для summarization.
// System prompt — cache-friendly, неизменный для всех чанков одного прогона.
// User prompt — per-chunk, строгий формат: Path/Kind/fqn/---/content.
import type { SummarizerInput } from './types.js';

// Системный промт. Не содержит токенов, специфичных для чанка — пригоден для prompt-cache.
// Требует 60-120 слов English, запрещает выдумывать API.
export const SYSTEM_PROMPT =
  'You summarize source-code and documentation fragments for semantic search. ' +
  'Write 60-120 words in English regardless of the language in comments or identifiers. ' +
  'Describe WHAT the fragment does and its role in a codebase so that developer-style ' +
  'natural-language queries (e.g. "how session refresh works", "payment flow") can match it. ' +
  'Never invent APIs, parameters, return types, or behaviour that is not explicitly present. ' +
  'Do not quote the code verbatim. Output a single paragraph, no headings, no bullet lists.';

// Поля User-промта, разделённые новой строкой. Формат строго:
//   Path: <path>
//   Kind: <kind>
//   FQN: <fqn>         (строка пропускается, если fqn отсутствует)
//   Language: <lang>   (строка пропускается, если language отсутствует)
//   ---
//   <content>
export function buildUserPrompt(input: SummarizerInput): string {
  const lines: string[] = [];

  lines.push(`Path: ${input.path}`);
  lines.push(`Kind: ${input.kind}`);

  if (input.fqn) {
    lines.push(`FQN: ${input.fqn}`);
  }

  if (input.language) {
    lines.push(`Language: ${input.language}`);
  }

  lines.push('---');
  lines.push(input.content);

  return lines.join('\n');
}
