// Тесты prompt builder для summarization.
import { describe, it, expect } from 'vitest';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt.js';
import type { SummarizerInput } from '../types.js';

describe('SYSTEM_PROMPT', () => {
  it('содержит требование English и 60-120 слов', () => {
    expect(SYSTEM_PROMPT).toMatch(/60-120 words/);
    expect(SYSTEM_PROMPT).toMatch(/English/);
    expect(SYSTEM_PROMPT).toMatch(/Never invent APIs/);
  });

  it('не содержит чанк-специфичных данных (cache-friendly)', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\${/);
    expect(SYSTEM_PROMPT).not.toMatch(/Path:/);
  });
});

describe('buildUserPrompt', () => {
  const baseInput: SummarizerInput = {
    path: 'src/auth/login.ts',
    kind: 'FUNCTION',
    fqn: 'auth.login.refresh',
    language: 'typescript',
    content: 'function refresh() { return token; }',
  };

  it('строго соблюдает порядок: Path, Kind, FQN, Language, ---, content', () => {
    const prompt = buildUserPrompt(baseInput);
    const lines = prompt.split('\n');

    expect(lines[0]).toBe('Path: src/auth/login.ts');
    expect(lines[1]).toBe('Kind: FUNCTION');
    expect(lines[2]).toBe('FQN: auth.login.refresh');
    expect(lines[3]).toBe('Language: typescript');
    expect(lines[4]).toBe('---');
    expect(lines[5]).toBe('function refresh() { return token; }');
  });

  it('пропускает строку FQN при отсутствии fqn', () => {
    const prompt = buildUserPrompt({
      path: 'src/x.ts',
      kind: 'TYPE',
      content: 'type X = number;',
    });

    expect(prompt).not.toMatch(/FQN:/);
    const lines = prompt.split('\n');
    expect(lines).toEqual([
      'Path: src/x.ts',
      'Kind: TYPE',
      '---',
      'type X = number;',
    ]);
  });

  it('пропускает строку Language при отсутствии language', () => {
    const prompt = buildUserPrompt({
      path: 'README.md',
      kind: 'markdown-section',
      fqn: 'overview',
      content: '# Overview',
    });

    expect(prompt).not.toMatch(/Language:/);
  });

  it('сохраняет многострочный контент без модификации', () => {
    const prompt = buildUserPrompt({
      path: 'a.ts',
      kind: 'CLASS',
      content: 'line1\nline2\nline3',
    });

    expect(prompt.endsWith('line1\nline2\nline3')).toBe(true);
  });
});
