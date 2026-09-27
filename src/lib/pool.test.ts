import { describe, expect, it } from 'vitest';
import { runPool } from './pool';

describe('runPool', () => {
  it('runs every item, at most `limit` at once, in order', async () => {
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    await runPool(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (n) => {
        started.push(n);
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
      },
      () => undefined,
    );
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
  it('reports failures and keeps going', async () => {
    const failed: number[] = [];
    const done: number[] = [];
    await runPool(
      [1, 2, 3],
      2,
      (n) => {
        if (n === 2) return Promise.reject(new Error('no'));
        done.push(n);
        return Promise.resolve();
      },
      (n) => failed.push(n),
    );
    expect(done).toEqual([1, 3]);
    expect(failed).toEqual([2]);
  });
  it('does nothing for an empty list', async () => {
    let calls = 0;
    await runPool([], 3, () => {
      calls += 1;
      return Promise.resolve();
    }, () => undefined);
    expect(calls).toBe(0);
  });
});
