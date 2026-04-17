// Skip-gates для summarization.
// Gate 1: слишком короткий контент не даёт LLM опоры → skip.
// Gate 2: TYPE/INTERFACE без docstring несёт мало семантики → skip (оставляем на v1.5).
import type { SummarizerInput } from './types.js';

// Минимальная длина content для суммаризации (символы).
export const MIN_CONTENT_LENGTH = 200;

// Виды чанков, для которых без docstring пропускаем суммаризацию.
// Имена сравниваются case-insensitive, чтобы совпадать и с 'TYPE' и с 'type'.
const DOCLESS_SKIP_KINDS = new Set(['type', 'interface']);

// Результат gate-проверки.
export interface GateDecision {
  skip: boolean;
  // Причина skip (для логов и dry-run статистики). Отсутствует при skip=false.
  reason?: string;
}

// Возвращает решение: пропускать чанк или суммаризировать.
// Проверки идут в фиксированном порядке, первый match побеждает.
export function shouldSummarize(input: SummarizerInput): GateDecision {
  // Gate 1: минимальная длина контента.
  if (!input.content || input.content.length < MIN_CONTENT_LENGTH) {
    return { skip: true, reason: `content<${MIN_CONTENT_LENGTH}` };
  }

  // Gate 2: TYPE/INTERFACE без docstring.
  const kindLower = input.kind.toLowerCase();
  if (DOCLESS_SKIP_KINDS.has(kindLower) && !input.hasDocstring) {
    return { skip: true, reason: `${kindLower}-without-docstring` };
  }

  return { skip: false };
}
