import { describe, expect, it } from 'vitest';
import { fitShift } from './useFitInWindow';

describe('a pop-out beside the rail stays inside the window', () => {
  it('stays put when it fits', () => {
    expect(fitShift(300, 600, 687)).toBe(0);
  });
  it('moves up just enough when it runs past the bottom', () => {
    expect(fitShift(472, 724, 687)).toBe(-45);
  });
  it('moves down when it runs past the top (an Edit panel growing up from its button)', () => {
    expect(fitShift(-160, 380, 687)).toBe(168);
  });
  it('keeps its top in the window when it is taller than the window', () => {
    expect(fitShift(100, 900, 687)).toBe(-92);
  });
});
