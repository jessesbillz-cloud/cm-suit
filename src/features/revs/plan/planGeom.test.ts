import { describe, expect, it } from 'vitest';
import {
  boxOf, cornersOf, cropAround, distanceTo, isLine, levelNames, levelTargets, midpoint, placePoint, toneColor, wallAt, wallTone,
} from './planGeom';

const count = (needed: number, passed: number, requested: number, failed: number) => ({ needed, passed, requested, failed });
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('wallTone', () => {
  it('any failed red, any requested gold, all passed green, else neutral', () => {
    expect(wallTone(count(5, 3, 1, 1))).toBe('not_approved');
    expect(wallTone(count(5, 3, 1, 0))).toBe('pending');
    expect(wallTone(count(5, 5, 0, 0))).toBe('approved');
    expect(wallTone(count(5, 2, 0, 0))).toBeNull();
    expect(wallTone(count(0, 0, 0, 0))).toBeNull();
  });
  it('colors from lib/status, as the status bars use them', () => {
    expect(toneColor('approved')).toBe('var(--status-approved-solid)');
    expect(toneColor('pending')).toBe('var(--status-pending-dot)');
    expect(toneColor('not_approved')).toBe('var(--status-not_approved-solid)');
    expect(toneColor(null)).toBe('var(--status-step_ahead-fg)');
  });
});

describe('midpoint / distanceTo / wallAt', () => {
  it('halfway along the line, true to the page shape, with the direction there', () => {
    const m = midpoint([[0.1, 0.2], [0.5, 0.2]], 0.5);
    expect(close(m.at[0], 0.3) && close(m.at[1], 0.2)).toBe(true);
    expect(m.dir).toEqual([1, 0]);
    // An L whose legs are 0.4 and 0.2 page widths long (the 0.4-high leg is 0.2 wide on a page half as high as wide).
    const l = midpoint([[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], 0.5);
    expect(close(l.at[0], 0.4) && close(l.at[1], 0.1)).toBe(true);
  });
  it('the distance from a point to a line, and the wall a tap is on', () => {
    expect(distanceTo([5, 5], [[0, 0], [10, 0]])).toBe(5);
    expect(distanceTo([-3, 4], [[0, 0], [10, 0]])).toBe(5);
    const walls = [{ id: 'a', line: [[0, 0], [100, 0]] as [number, number][] }, { id: 'b', line: [[0, 30], [100, 30]] as [number, number][] }];
    expect(wallAt([50, 12], walls, 20)?.id).toBe('a');
    expect(wallAt([50, 18], walls, 20)?.id).toBe('b');
    expect(wallAt([50, 80], walls, 20)).toBeNull();
  });
});

describe('placePoint', () => {
  it('lands on a corner already drawn when close', () => {
    expect(placePoint([0.302, 0.401], [], [[0.3, 0.4]], 0.01, 1)).toEqual([0.3, 0.4]);
    expect(placePoint([0.33, 0.401], [], [[0.3, 0.4]], 0.01, 1)).toEqual([0.33, 0.401]);
  });
  it('closes on its own start', () => {
    expect(placePoint([0.101, 0.1], [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]], [], 0.01, 1)).toEqual([0.1, 0.1]);
  });
  it('squares a nearly level or plumb segment to the last point', () => {
    expect(placePoint([0.5, 0.21], [[0.1, 0.2]], [], 0.005, 1)).toEqual([0.5, 0.2]);
    expect(placePoint([0.11, 0.6], [[0.1, 0.2]], [], 0.005, 1)).toEqual([0.1, 0.6]);
    expect(placePoint([0.4, 0.5], [[0.1, 0.2]], [], 0.005, 1)).toEqual([0.4, 0.5]);
  });
  it('stays on the page', () => {
    expect(placePoint([1.2, -0.1], [], [], 0.005, 1)).toEqual([1, 0]);
  });
  it('a line needs two points apart', () => {
    expect(isLine([[0.1, 0.1], [0.2, 0.1]])).toBe(true);
    expect(isLine([[0.1, 0.1], [0.1, 0.1]])).toBe(false);
    expect(isLine([[0.1, 0.1]])).toBe(false);
  });
});

describe('cropAround', () => {
  it('pads the wall and takes the thumbnail shape', () => {
    // A level wall 0.3 wide on a square page, padded a third each side; the thumbnail is half as high as wide.
    const c = cropAround([[0.35, 0.5], [0.65, 0.5]], 1, 0.5);
    expect(close(c.w, 0.5) && close(c.h, 0.25)).toBe(true);
    expect(close(c.x + c.w / 2, 0.5) && close(c.y + c.h / 2, 0.5)).toBe(true);
  });
  it('stays on the page near an edge', () => {
    const c = cropAround([[0.0, 0.05], [0.2, 0.05]], 1, 0.5);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });
  it('is true to the page shape (heights in page heights)', () => {
    const c = cropAround([[0.35, 0.5], [0.65, 0.5]], 0.5, 0.5);
    expect(close(c.h, 0.5)).toBe(true);
  });
});

describe('levels and their sheets', () => {
  const a = (level: string, sheet: string | null, page: number, drawn: boolean) => ({
    level, sheet_file_id: sheet, sheet_page: page, geom: drawn ? ([[0, 0], [1, 1]] as [number, number][]) : null,
  });
  it('levels in natural order, each once', () => {
    expect(levelNames([a('Level 10', null, 1, false), a('Level 2', null, 1, false), a(' level 2 ', null, 1, false)])).toEqual(['Level 2', 'Level 10']);
  });
  it('the sheets its walls are drawn on (most walls first); none drawn: those its walls name', () => {
    const out = levelTargets([a('L', 'b', 1, true), a('L', 'a', 2, true), a('L', 'a', 2, true), a('L', 'c', 1, false), a('L', 'a', 2, false)]);
    expect(out).toEqual([{ fileId: 'a', page: 2 }, { fileId: 'b', page: 1 }]);
    expect(levelTargets([a('L', 'c', 1, false), a('L', 'd', 3, false), a('L', 'c', 1, false)])).toEqual([{ fileId: 'c', page: 1 }, { fileId: 'd', page: 3 }]);
    expect(levelTargets([a('L', null, 1, false)])).toEqual([]);
  });
  it('box and corners of lines', () => {
    const b = boxOf([[[0.1, 0.2], [0.3, 0.6]]]);
    expect(close(b.x, 0.1) && close(b.y, 0.2) && close(b.w, 0.2) && close(b.h, 0.4)).toBe(true);
    expect(cornersOf([[[0.1, 0.2], [0.3, 0.6]], [[0.5, 0.5], [0.6, 0.5]]])).toHaveLength(4);
  });
});
