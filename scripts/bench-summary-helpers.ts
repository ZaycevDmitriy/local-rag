import type { SearchResult } from '../src/search/types.js';

export interface BaselineExpectation {
  path: string;
  startLine: number;
  endLine: number;
  fqn?: string;
}

export interface BaselineQuery {
  query: string;
  expected: BaselineExpectation[];
  category: string;
  difficulty?: string;
  seedKind?: string;
}

export interface BaselineFile {
  version: 2;
  source: string;
  queries: BaselineQuery[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function fail(message: string): never {
  throw new Error(`Invalid baseline file: ${message}`);
}

export function validateBaselineFile(parsed: unknown): BaselineFile {
  if (!isRecord(parsed)) {
    fail('root must be an object.');
  }

  if (parsed['version'] !== 2) {
    if (parsed['version'] === 1 || 'goldenFqns' in parsed) {
      throw new Error('golden set v1 deprecated, regenerate per README');
    }
    fail(`version must be 2, got ${String(parsed['version'])}.`);
  }

  if (!isNonEmptyString(parsed['source'])) {
    fail('source must be a non-empty string.');
  }

  const queries = parsed['queries'];
  if (!Array.isArray(queries) || queries.length === 0) {
    fail('queries must be a non-empty array.');
  }

  const validatedQueries: BaselineQuery[] = queries.map((queryValue, queryIndex) => {
    if (!isRecord(queryValue)) {
      fail(`queries[${queryIndex}] must be an object.`);
    }
    if (!isNonEmptyString(queryValue['query'])) {
      fail(`queries[${queryIndex}].query must be a non-empty string.`);
    }
    if (!isNonEmptyString(queryValue['category'])) {
      fail(`queries[${queryIndex}].category must be a non-empty string.`);
    }

    const expected = queryValue['expected'];
    if (!Array.isArray(expected) || expected.length === 0) {
      fail(`queries[${queryIndex}].expected must be a non-empty array.`);
    }
    if (expected.length > 3) {
      fail(`queries[${queryIndex}].expected must contain 1-3 items.`);
    }

    const validatedExpected: BaselineExpectation[] = expected.map((expectedValue, expectedIndex) => {
      const prefix = `queries[${queryIndex}].expected[${expectedIndex}]`;
      if (!isRecord(expectedValue)) {
        fail(`${prefix} must be an object.`);
      }
      if (!isNonEmptyString(expectedValue['path'])) {
        fail(`${prefix}.path must be a non-empty string.`);
      }
      if (!isPositiveInteger(expectedValue['startLine'])) {
        fail(`${prefix}.startLine must be a finite positive integer.`);
      }
      if (!isPositiveInteger(expectedValue['endLine'])) {
        fail(`${prefix}.endLine must be a finite positive integer.`);
      }
      if ((expectedValue['startLine'] as number) > (expectedValue['endLine'] as number)) {
        fail(`${prefix}.startLine must be <= endLine.`);
      }
      if (expectedValue['fqn'] !== undefined && typeof expectedValue['fqn'] !== 'string') {
        fail(`${prefix}.fqn must be a string when present.`);
      }

      return {
        path: expectedValue['path'],
        startLine: expectedValue['startLine'],
        endLine: expectedValue['endLine'],
        ...(expectedValue['fqn'] !== undefined ? { fqn: expectedValue['fqn'] } : {}),
      };
    });

    return {
      query: queryValue['query'],
      expected: validatedExpected,
      category: queryValue['category'],
      ...(typeof queryValue['difficulty'] === 'string' ? { difficulty: queryValue['difficulty'] } : {}),
      ...(typeof queryValue['seedKind'] === 'string' ? { seedKind: queryValue['seedKind'] } : {}),
    };
  });

  return {
    version: 2,
    source: parsed['source'],
    queries: validatedQueries,
  };
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function matchByPathAndLineRange(
  expected: BaselineExpectation,
  candidate: Pick<SearchResult, 'path' | 'coordinates'>,
): boolean {
  const normalizedExpectedPath = normalizePath(expected.path);
  const normalizedCandidatePath = normalizePath(candidate.path);
  const startLine = candidate.coordinates.startLine ?? -Infinity;
  const endLine = candidate.coordinates.endLine ?? Infinity;

  return normalizedExpectedPath === normalizedCandidatePath
    && !(endLine < expected.startLine || startLine > expected.endLine);
}
