import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_WIDTH, STROKE_LIMITS } from '../../lib/markup';
import { mapWalls, offsetLine, wallPage, wallStrokes, type MapWall } from './wallStrokes';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('offsetLine', () => {
  it('moves a level wall up or down the page, the same distance on screen whatever the page shape', () => {
    // A 36 x 24 sheet: aspect 2/3. 0.01 page widths down is 0.015 of the height.
    const out = offsetLine([[0.2, 0.5], [0.6, 0.5]], 0.01, 2 / 3);
    expect(out.map((p) => p[0])).toEqual([0.2, 0.6]);
    expect(out.every((p) => near(p[1], 0.515))).toBe(true);
  });
  it('moves a plumb wall sideways by the same page widths', () => {
    const out = offsetLine([[0.4, 0.1], [0.4, 0.3]], 0.01, 2 / 3);
    expect(out.every((p) => near(p[0], 0.39))).toBe(true);
    expect(out.map((p) => p[1])).toEqual([0.1, 0.3]);
  });
  it('miters a corner so both legs stay the same distance from the wall', () => {
    // An L: right, then down (aspect 1). Moved 0.01: the top leg down, the side leg left, the corner at both.
    const out = offsetLine([[0.2, 0.2], [0.5, 0.2], [0.5, 0.6]], 0.01, 1);
    expect(near(out[0]?.[1] ?? 0, 0.21)).toBe(true);
    expect(near(out[1]?.[0] ?? 0, 0.49) && near(out[1]?.[1] ?? 0, 0.21)).toBe(true);
    expect(near(out[2]?.[0] ?? 0, 0.49)).toBe(true);
  });
  it('keeps a sharp corner from shooting off (miter limit)', () => {
    const out = offsetLine([[0.2, 0.5], [0.8, 0.5], [0.2, 0.501]], 0.01, 1);
    const corner = out[1] ?? [0, 0];
    expect(Math.hypot(corner[0] - 0.8, corner[1] - 0.5)).toBeLessThan(0.0301);
  });
  it('keeps every point on the page', () => {
    const out = offsetLine([[0, 0], [1, 0]], -0.01, 1);
    expect(out).toEqual([[0, 0], [1, 0]]);
    const edge = offsetLine([[0.999, 0.2], [0.999, 0.4]], -0.01, 1);
    expect(edge.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
  });
  it('drops repeated points and leaves a line without length where it is', () => {
    const kept = offsetLine([[0.2, 0.2], [0.2, 0.2], [0.4, 0.2]], 0.01, 1);
    expect(kept.map(([x, y]) => [x, Math.round(y * 1e9) / 1e9])).toEqual([[0.2, 0.21], [0.4, 0.21]]);
    expect(offsetLine([[0.3, 0.3], [0.3, 0.3]], 0.01, 1)).toEqual([[0.3, 0.3], [0.3, 0.3]]);
  });
});

const wall = (colors: MapWall['colors'], page = 1, sheet = 'sheet-1'): MapWall => ({
  sheetFileId: sheet, page, line: [[0.2, 0.5], [0.6, 0.5]], colors,
});

describe('wallStrokes', () => {
  it('one stroke per wall per item, in the item colors, at the highlighter width', () => {
    const out = wallStrokes([wall([1, 2]), { ...wall([1]), line: [[0.1, 0.1], [0.1, 0.4]] }], 'sheet-1', 1, 1);
    expect(out.map((s) => s.c)).toEqual([1, 2, 1]);
    expect(out.every((s) => s.w === HIGHLIGHT_WIDTH)).toBe(true);
  });
  it('sets two or three colors on one wall side by side, a stroke width apart, around the wall', () => {
    const three = wallStrokes([wall([1, 2, 3])], 'sheet-1', 1, 1, 0.004);
    expect(three.map((s) => s.p[0]?.[1])).toEqual([0.496, 0.5, 0.504]);
    const two = wallStrokes([wall([1, 3])], 'sheet-1', 1, 1, 0.004);
    expect(two.map((s) => s.p[0]?.[1])).toEqual([0.498, 0.502]);
    expect(wallStrokes([wall([2])], 'sheet-1', 1, 1, 0.004)[0]?.p).toEqual([[0.2, 0.5], [0.6, 0.5]]);
  });
  it('only the walls on this sheet and page', () => {
    expect(wallStrokes([wall([1], 2), wall([1], 1, 'sheet-2')], 'sheet-1', 1, 1)).toEqual([]);
    expect(wallStrokes([wall([1], 2)], 'sheet-1', 2, 1)).toHaveLength(1);
  });
  it('strokes the database takes: points 0..1, at least two, 300 strokes at most, widths in range', () => {
    const many = Array.from({ length: 120 }, () => wall([1, 2, 3]));
    const out = wallStrokes(many, 'sheet-1', 1, 0.75);
    expect(out).toHaveLength(STROKE_LIMITS.maxStrokes);
    for (const s of out) {
      expect(s.p.length >= STROKE_LIMITS.minPoints && s.p.length <= STROKE_LIMITS.maxPoints).toBe(true);
      expect(s.p.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
      expect(s.w >= STROKE_LIMITS.minWidth && s.w <= STROKE_LIMITS.maxWidth).toBe(true);
    }
  });
});

describe('mapWalls / wallPage', () => {
  const areas = [
    { id: 'a', sheet_file_id: 'sheet-1', sheet_page: 3, geom: [[0.1, 0.1], [0.2, 0.1]] as [number, number][] },
    { id: 'b', sheet_file_id: 'sheet-1', sheet_page: 1, geom: null },
    { id: 'c', sheet_file_id: null, sheet_page: 1, geom: null },
  ];
  it('the request walls drawn on the plan, each with its colors in order', () => {
    const cells = [{ area_id: 'a', color: 2 }, { area_id: 'a', color: 1 }, { area_id: 'b', color: 1 }, { area_id: 'a', color: 2 }];
    expect(mapWalls(cells, areas)).toEqual([{ sheetFileId: 'sheet-1', page: 3, line: [[0.1, 0.1], [0.2, 0.1]], colors: [1, 2] }]);
  });
  it('the page of a sheet the walls are drawn on, else 1', () => {
    const walls = mapWalls([{ area_id: 'a', color: 1 }], areas);
    expect(wallPage(walls, 'sheet-1')).toBe(3);
    expect(wallPage(walls, 'sheet-2')).toBe(1);
  });
});
