// MockSummarizer — детерминированный псевдо-LLM для тестов.
// Генерирует стабильную summary по hash-у входа и возвращает её без внешних вызовов.
import { createHash } from 'node:crypto';
import type { Summarizer, SummarizerInput, SummarizerResult } from './types.js';

// Создаёт короткую английскую summary на основе полей входа.
// Формат имитирует реальный LLM-output: 1-2 предложения, English, без галлюцинаций API.
function buildMockSummary(input: SummarizerInput): string {
  const hash = createHash('sha256')
    .update(input.path + '|' + input.content)
    .digest('hex')
    .slice(0, 8);

  const kindLabel = input.kind.toLowerCase();
  const fqnLabel = input.fqn ? ` (${input.fqn})` : '';

  return `Mock summary ${hash}: ${kindLabel}${fqnLabel} in ${input.path}. ` +
    `Content length ${input.content.length} chars; generated deterministically for tests.`;
}

// Детерминированная реализация Summarizer.
// Всегда возвращает успех, если content непустой; иначе null с reason.
export class MockSummarizer implements Summarizer {
  async summarize(input: SummarizerInput): Promise<SummarizerResult> {
    if (!input.content || input.content.trim().length === 0) {
      return { summary: null, reason: 'empty content' };
    }

    return { summary: buildMockSummary(input) };
  }
}
