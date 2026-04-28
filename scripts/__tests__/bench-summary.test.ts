import { describe, it, expect } from 'vitest';
import {
  matchByPathAndLineRange,
  normalizePath,
  validateBaselineFile,
} from '../bench-summary-helpers.js';
import type { SearchResult } from '../../src/search/types.js';

function makeResult(path: string, startLine?: number, endLine?: number): Pick<SearchResult, 'path' | 'coordinates'> {
  return {
    path,
    coordinates: {
      ...(startLine !== undefined ? { startLine } : {}),
      ...(endLine !== undefined ? { endLine } : {}),
    },
  };
}

function validBaseline() {
  return {
    version: 2,
    source: 'karipos',
    queries: [
      {
        query: 'print receipt',
        category: 'printing',
        difficulty: 'medium',
        seedKind: 'manual',
        expected: [
          {
            path: 'src/features/print/receipt.ts',
            startLine: 10,
            endLine: 25,
            fqn: 'printReceipt',
          },
        ],
      },
    ],
  };
}

describe('bench-summary helpers', () => {
  it('normalizePath приводит windows-разделители и убирает ведущий ./', () => {
    expect(normalizePath('./src\\foo.ts')).toBe('src/foo.ts');
  });

  it('matchByPathAndLineRange засчитывает пересечение диапазонов', () => {
    expect(matchByPathAndLineRange(
      { path: 'src/foo.ts', startLine: 10, endLine: 20 },
      makeResult('./src\\foo.ts', 15, 30),
    )).toBe(true);
  });

  it('matchByPathAndLineRange не засчитывает соседние непересекающиеся диапазоны', () => {
    expect(matchByPathAndLineRange(
      { path: 'src/foo.ts', startLine: 10, endLine: 20 },
      makeResult('src/foo.ts', 21, 30),
    )).toBe(false);
  });

  it('validateBaselineFile принимает корректный v2 baseline', () => {
    expect(validateBaselineFile(validBaseline())).toEqual(validBaseline());
  });

  it('validateBaselineFile отклоняет v1 goldenFqns', () => {
    expect(() => validateBaselineFile({
      version: 1,
      source: 'karipos',
      queries: [{ query: 'q', goldenFqns: ['Foo'], category: 'auth' }],
    })).toThrow('golden set v1 deprecated, regenerate per README');
  });

  it('validateBaselineFile отклоняет missing expected', () => {
    const baseline = validBaseline();
    delete (baseline.queries[0] as Record<string, unknown>)['expected'];

    expect(() => validateBaselineFile(baseline)).toThrow('queries[0].expected');
  });

  it('validateBaselineFile отклоняет пустой expected', () => {
    const baseline = validBaseline();
    baseline.queries[0]!.expected = [];

    expect(() => validateBaselineFile(baseline)).toThrow('queries[0].expected');
  });

  it('validateBaselineFile отклоняет строковые line numbers', () => {
    const baseline = validBaseline();
    (baseline.queries[0]!.expected[0] as unknown as Record<string, unknown>)['startLine'] = '10';

    expect(() => validateBaselineFile(baseline)).toThrow('queries[0].expected[0].startLine');
  });

  it('validateBaselineFile отклоняет startLine > endLine', () => {
    const baseline = validBaseline();
    baseline.queries[0]!.expected[0]!.startLine = 30;

    expect(() => validateBaselineFile(baseline)).toThrow('queries[0].expected[0].startLine');
  });
});
