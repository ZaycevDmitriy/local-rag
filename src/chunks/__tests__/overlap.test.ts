import { describe, it, expect } from 'vitest';
import { computeOverlap } from '../overlap.js';

describe('computeOverlap', () => {
  it('возвращает строки с конца, укладывающиеся в overlapChars', () => {
    const lines = ['aaaa', 'bbbb', 'cccc'];
    // overlapChars=10: 'cccc' (4+1=5), 'bbbb' (4+1=5) → 10 ≤ 10 → обе берём.
    const result = computeOverlap(lines, 10);

    expect(result.overlapLines).toEqual(['bbbb', 'cccc']);
    expect(result.overlapLength).toBe(10);
  });

  it('останавливается, когда следующая строка превысит лимит', () => {
    const lines = ['aaaa', 'bbbb', 'cccc'];
    // overlapChars=6: 'cccc' (4+1=5), 'bbbb' (4+1=5) → 10 > 6 → только 'cccc'.
    const result = computeOverlap(lines, 6);

    expect(result.overlapLines).toEqual(['cccc']);
    expect(result.overlapLength).toBe(5);
  });

  it('возвращает все строки, если они укладываются в лимит', () => {
    const lines = ['ab', 'cd'];
    // overlapChars=100: 'cd' (2+1=3), 'ab' (2+1=3) → 6 ≤ 100 → все.
    const result = computeOverlap(lines, 100);

    expect(result.overlapLines).toEqual(['ab', 'cd']);
    expect(result.overlapLength).toBe(6);
  });

  it('всегда берёт хотя бы одну строку', () => {
    const lines = ['very long line that exceeds overlap limit'];
    // overlapChars=5: строка длинная, но всегда берём хотя бы одну.
    const result = computeOverlap(lines, 5);

    expect(result.overlapLines).toEqual(['very long line that exceeds overlap limit']);
    expect(result.overlapLength).toBe(42); // 41 символ + 1 для \n.
  });

  it('возвращает пустой результат для пустого массива', () => {
    const result = computeOverlap([], 100);

    expect(result.overlapLines).toEqual([]);
    expect(result.overlapLength).toBe(0);
  });

  it('overlapChars = 0 берёт одну строку', () => {
    const lines = ['aaa', 'bbb'];
    // overlapChars=0: 'bbb' (3+1=4), 4 > 0 но overlapLines.length === 0 → берём.
    const result = computeOverlap(lines, 0);

    expect(result.overlapLines).toEqual(['bbb']);
    expect(result.overlapLength).toBe(4);
  });
});
