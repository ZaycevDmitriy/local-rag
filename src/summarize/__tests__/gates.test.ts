// Тесты skip-gates для summarization.
import { describe, it, expect } from 'vitest';
import { shouldSummarize, MIN_CONTENT_LENGTH } from '../gates.js';
import type { SummarizerInput } from '../types.js';

function makeInput(overrides: Partial<SummarizerInput>): SummarizerInput {
  return {
    path: 'src/x.ts',
    kind: 'FUNCTION',
    content: 'x'.repeat(MIN_CONTENT_LENGTH + 10),
    ...overrides,
  };
}

describe('shouldSummarize', () => {
  it('Gate 1: пустой content → skip с reason content<200', () => {
    const result = shouldSummarize(makeInput({ content: '' }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/content<200/);
  });

  it('Gate 1: короткий content → skip', () => {
    const result = shouldSummarize(makeInput({ content: 'x'.repeat(199) }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/content<200/);
  });

  it('Gate 1: ровно 200 символов → pass', () => {
    const result = shouldSummarize(makeInput({ content: 'x'.repeat(200) }));
    expect(result.skip).toBe(false);
  });

  it('Gate 2: TYPE без docstring → skip', () => {
    const result = shouldSummarize(makeInput({
      kind: 'TYPE',
      hasDocstring: false,
    }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/type-without-docstring/);
  });

  it('Gate 2: INTERFACE без docstring → skip', () => {
    const result = shouldSummarize(makeInput({
      kind: 'INTERFACE',
      hasDocstring: false,
    }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/interface-without-docstring/);
  });

  it('Gate 2: TYPE с docstring → pass', () => {
    const result = shouldSummarize(makeInput({
      kind: 'TYPE',
      hasDocstring: true,
    }));
    expect(result.skip).toBe(false);
  });

  it('Gate 2: case-insensitive (type vs TYPE)', () => {
    const result = shouldSummarize(makeInput({ kind: 'type', hasDocstring: false }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/type-without-docstring/);
  });

  it('FUNCTION без docstring → pass (Gate 2 не применим)', () => {
    const result = shouldSummarize(makeInput({
      kind: 'FUNCTION',
      hasDocstring: false,
    }));
    expect(result.skip).toBe(false);
  });

  it('Gate 1 срабатывает раньше Gate 2 (короткий TYPE)', () => {
    const result = shouldSummarize(makeInput({
      kind: 'TYPE',
      hasDocstring: false,
      content: 'short',
    }));
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/content<200/);
  });
});
