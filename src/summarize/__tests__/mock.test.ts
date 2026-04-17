// Тесты MockSummarizer на детерминированность.
import { describe, it, expect } from 'vitest';
import { MockSummarizer } from '../mock.js';
import type { SummarizerInput } from '../types.js';

describe('MockSummarizer', () => {
  const summarizer = new MockSummarizer();

  const sampleInput: SummarizerInput = {
    path: 'src/auth.ts',
    kind: 'FUNCTION',
    fqn: 'auth.login',
    content: 'function login() {}',
  };

  it('возвращает детерминированную summary для одинакового входа', async () => {
    const r1 = await summarizer.summarize(sampleInput);
    const r2 = await summarizer.summarize(sampleInput);
    expect(r1.summary).toBe(r2.summary);
    expect(r1.summary).not.toBeNull();
  });

  it('возвращает разные summary для разного content', async () => {
    const r1 = await summarizer.summarize({ ...sampleInput, content: 'foo' });
    const r2 = await summarizer.summarize({ ...sampleInput, content: 'bar' });
    expect(r1.summary).not.toBe(r2.summary);
  });

  it('возвращает null для пустого content', async () => {
    const result = await summarizer.summarize({
      path: 'a.ts',
      kind: 'FUNCTION',
      content: '',
    });
    expect(result.summary).toBeNull();
    expect(result.reason).toMatch(/empty content/);
  });

  it('включает path в summary для трассируемости', async () => {
    const result = await summarizer.summarize(sampleInput);
    expect(result.summary).toContain('src/auth.ts');
  });
});
