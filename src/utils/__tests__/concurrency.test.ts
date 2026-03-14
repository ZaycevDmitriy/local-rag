import { describe, it, expect } from 'vitest';
import { pMap } from '../concurrency.js';

describe('pMap', () => {
  it('обрабатывает все элементы и возвращает результаты в порядке', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await pMap(items, async (x) => x * 2, 3);

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('возвращает пустой массив для пустого входа', async () => {
    const results = await pMap([], async (x: number) => x, 3);
    expect(results).toEqual([]);
  });

  it('ограничивает параллельное выполнение', async () => {
    let running = 0;
    let maxRunning = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await pMap(
      items,
      async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        // Имитация async работы.
        await new Promise((r) => setTimeout(r, 10));
        running--;
      },
      3,
    );

    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it('передаёт index в mapper', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];

    await pMap(items, async (_, index) => {
      indices.push(index);
    }, 2);

    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  it('работает с concurrency=1 (последовательно)', async () => {
    const order: number[] = [];
    const items = [1, 2, 3];

    await pMap(items, async (x) => {
      order.push(x);
      await new Promise((r) => setTimeout(r, 5));
    }, 1);

    expect(order).toEqual([1, 2, 3]);
  });

  it('работает, когда concurrency > items.length', async () => {
    const items = [1, 2];
    const results = await pMap(items, async (x) => x + 10, 100);

    expect(results).toEqual([11, 12]);
  });

  it('пробрасывает ошибку из mapper', async () => {
    const items = [1, 2, 3];

    await expect(
      pMap(items, async (x) => {
        if (x === 2) throw new Error('fail');
        return x;
      }, 2),
    ).rejects.toThrow('fail');
  });

  it('сохраняет порядок результатов при разном времени выполнения', async () => {
    const items = [3, 1, 2];
    const results = await pMap(
      items,
      async (x) => {
        await new Promise((r) => setTimeout(r, x * 5));
        return x * 10;
      },
      3,
    );

    expect(results).toEqual([30, 10, 20]);
  });
});
