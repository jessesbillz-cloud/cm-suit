import { describe, expect, it } from 'vitest';
import { nextPicked } from './ChipPick';

describe('nextPicked', () => {
  it('one pick: a tap picks it, another replaces it, a second tap drops it', () => {
    expect(nextPicked([], 'a', false, Infinity)).toEqual(['a']);
    expect(nextPicked(['a'], 'b', false, Infinity)).toEqual(['b']);
    expect(nextPicked(['a'], 'a', false, Infinity)).toEqual([]);
  });

  it('several: adds up to the cap, then waits until one is dropped', () => {
    expect(nextPicked(['a', 'b'], 'c', true, 3)).toEqual(['a', 'b', 'c']);
    expect(nextPicked(['a', 'b', 'c'], 'd', true, 3)).toEqual(['a', 'b', 'c']);
    expect(nextPicked(['a', 'b', 'c'], 'b', true, 3)).toEqual(['a', 'c']);
  });
});
