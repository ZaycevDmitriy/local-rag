// Helper: конвертация строки БД в SummarizerInput.
// Имя `detectJsStyleDocstring` явно отражает лимитацию: эвристика ловит
// JSDoc/JavaDoc/Kotlin-doc (`/**`, `/*!`) и JS-style triple-quote (`"""`),
// но не Python `'''` и не Ruby `=begin`. Для новых языков либо расширить
// набор маркеров, либо перенести детекцию в language-specific extractor.
import type { SummarizerInput } from '../../summarize/index.js';

// Подмножество полей строки БД, которые нужны для построения SummarizerInput.
export interface SummarizeCandidateRow {
  content_hash: string;
  content: string;
  path: string;
  source_type: string;
  language: string | null;
  metadata: Record<string, unknown>;
}

// Простая эвристика: ловит JSDoc/JavaDoc/Kotlin-doc и JS-style docstring (`"""`).
// Python (`'''`) и Ruby (`=begin`) НЕ покрываются — для них нужен отдельный детектор.
export function detectJsStyleDocstring(content: string): boolean {
  const head = content.slice(0, 256);
  return head.includes('/**') || head.includes('/*!') || head.includes('"""');
}

// Собирает SummarizerInput из строки БД.
export function toSummarizerInput(row: SummarizeCandidateRow): SummarizerInput {
  const meta = row.metadata;
  const fqn = typeof meta.fqn === 'string' ? meta.fqn : undefined;
  const fragmentType = typeof meta.fragmentType === 'string'
    ? meta.fragmentType
    : row.source_type;

  return {
    path: row.path,
    kind: fragmentType,
    fqn,
    language: row.language ?? undefined,
    hasDocstring: detectJsStyleDocstring(row.content),
    content: row.content,
  };
}
