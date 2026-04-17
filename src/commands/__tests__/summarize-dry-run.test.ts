// Unit-тесты на helpers для `rag summarize --dry-run`.
// Покрывают вынесенную из команды бизнес-логику без моков Commander.
import { describe, it, expect } from 'vitest';
import type { SummarizerInput } from '../../summarize/index.js';
import { estimateDryRun, formatCost } from '../_helpers/summarize-dry-run.js';
import { detectJsStyleDocstring, toSummarizerInput } from '../_helpers/summarize-input.js';

const LONG_CONTENT = 'a'.repeat(300);

function makeInput(overrides: Partial<SummarizerInput> = {}): SummarizerInput {
  return {
    path: 'src/a.ts',
    kind: 'FUNCTION',
    language: 'ts',
    hasDocstring: false,
    content: LONG_CONTENT,
    ...overrides,
  };
}

describe('formatCost', () => {
  it('миллидоллары при цене < $0.01', () => {
    expect(formatCost(0.00012)).toBe('$0.12m');
    expect(formatCost(0)).toBe('$0.00m');
  });

  it('доллары с 3 знаками при цене >= $0.01', () => {
    expect(formatCost(0.5)).toBe('$0.500');
    expect(formatCost(12.345)).toBe('$12.345');
  });
});

describe('estimateDryRun', () => {
  const defaults = {
    avgTokensPerChunk: 200,
    pricePerTokenUsd: 5e-8,
  };

  it('пустой sample → skipRate=0, expected=totalCandidates', () => {
    const estimate = estimateDryRun({
      sample: [],
      totalCandidates: 1000,
      ...defaults,
    });

    expect(estimate.sampleSize).toBe(0);
    expect(estimate.skippedInSample).toBe(0);
    expect(estimate.skipRate).toBe(0);
    expect(estimate.expectedSummarize).toBe(1000);
    expect(estimate.estimatedTokens).toBe(200_000);
    expect(estimate.estimatedCostUsd).toBeCloseTo(0.01, 10);
  });

  it('все кандидаты skipped → expectedSummarize=0 и cost=0', () => {
    // Gate 1: content < 200 символов отбрасывается.
    const sample = [makeInput({ content: 'short' }), makeInput({ content: 'tiny' })];
    const estimate = estimateDryRun({
      sample,
      totalCandidates: 100,
      ...defaults,
    });

    expect(estimate.skippedInSample).toBe(2);
    expect(estimate.skipRate).toBe(1);
    expect(estimate.expectedSummarize).toBe(0);
    expect(estimate.estimatedCostUsd).toBe(0);
  });

  it('смешанный sample → skipRate и expectedSummarize пропорциональны', () => {
    const sample = [
      makeInput({ content: 'short' }), // Skip Gate 1.
      makeInput(), // Summarize.
      makeInput(), // Summarize.
      makeInput(), // Summarize.
    ];
    const estimate = estimateDryRun({
      sample,
      totalCandidates: 400,
      ...defaults,
    });

    expect(estimate.sampleSize).toBe(4);
    expect(estimate.skippedInSample).toBe(1);
    expect(estimate.skipRate).toBe(0.25);
    expect(estimate.expectedSummarize).toBe(300);
    expect(estimate.estimatedTokens).toBe(60_000);
  });

  it('учитывает переопределённые avgTokensPerChunk и pricePerTokenUsd', () => {
    const sample = [makeInput()];
    const estimate = estimateDryRun({
      sample,
      totalCandidates: 10,
      avgTokensPerChunk: 500,
      pricePerTokenUsd: 1e-6,
    });

    expect(estimate.estimatedTokens).toBe(5_000);
    expect(estimate.estimatedCostUsd).toBeCloseTo(0.005, 10);
  });
});

describe('detectJsStyleDocstring', () => {
  it('ловит JSDoc `/**`', () => {
    expect(detectJsStyleDocstring('/** docstring */\nfunction foo() {}')).toBe(true);
  });

  it('ловит Doxygen `/*!`', () => {
    expect(detectJsStyleDocstring('/*! doxygen */\nvoid bar();')).toBe(true);
  });

  it('ловит JS-style triple-quote `"""`', () => {
    expect(detectJsStyleDocstring('"""top-level docstring"""\nbody')).toBe(true);
  });

  it('не ловит Python `\'\'\'` (известная лимитация)', () => {
    const pythonDoc = '\'\'\'python docstring\'\'\'\nbody';
    expect(detectJsStyleDocstring(pythonDoc)).toBe(false);
  });

  it('не ловит Ruby `=begin` (известная лимитация)', () => {
    expect(detectJsStyleDocstring('=begin ruby comment =end\nbody')).toBe(false);
  });

  it('смотрит только в первые 256 символов', () => {
    const content = 'x'.repeat(300) + '/** late docstring */';
    expect(detectJsStyleDocstring(content)).toBe(false);
  });
});

describe('toSummarizerInput', () => {
  it('превращает строку БД в SummarizerInput с fqn и fragmentType из metadata', () => {
    const input = toSummarizerInput({
      content_hash: 'h1',
      content: '/** doc */\nfunction foo() {}',
      path: 'src/a.ts',
      source_type: 'code',
      language: 'ts',
      metadata: { fqn: 'Foo.foo', fragmentType: 'METHOD' },
    });

    expect(input.path).toBe('src/a.ts');
    expect(input.kind).toBe('METHOD');
    expect(input.fqn).toBe('Foo.foo');
    expect(input.language).toBe('ts');
    expect(input.hasDocstring).toBe(true);
  });

  it('fallback: fragmentType=source_type если в metadata нет', () => {
    const input = toSummarizerInput({
      content_hash: 'h1',
      content: 'no docs here',
      path: 'src/a.ts',
      source_type: 'code',
      language: null,
      metadata: {},
    });

    expect(input.kind).toBe('code');
    expect(input.fqn).toBeUndefined();
    expect(input.language).toBeUndefined();
    expect(input.hasDocstring).toBe(false);
  });
});
