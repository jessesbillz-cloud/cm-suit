import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_OPACITY, MARKUP_COLORS, MAX_STROKE_POINTS, STROKE_LIMITS, UNDO_DEPTH, finishStroke, rememberBefore, simplify,
  strokePath, undoStep, type Stroke,
} from './markup';

describe('MARKUP_COLORS', () => {
  it('is the contract the map PDF and the database use: green, blue, magenta', () => {
    expect(MARKUP_COLORS).toEqual({ 1: '#16A34A', 2: '#2563EB', 3: '#DB2777' });
    expect(HIGHLIGHT_OPACITY).toBe(0.45);
  });
});

describe('simplify', () => {
  it('drops points on a straight line and keeps the corner', () => {
    const line: [number, number][] = [[0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.3, 0.1], [0.3, 0.2]];
    expect(simplify(line, 0.001)).toEqual([[0, 0], [0.3, 0], [0.3, 0.2]]);
  });
  it('leaves two points alone', () => {
    expect(simplify([[0, 0], [1, 1]], 0.5)).toEqual([[0, 0], [1, 1]]);
  });
});

describe('finishStroke', () => {
  it('keeps the points on the page', () => {
    const s = finishStroke([[-0.2, 0.5], [0.5, 1.4]], 1, 0.004, 1);
    expect(s?.p).toEqual([[0, 0.5], [0.5, 1]]);
  });
  it('turns a tap into a dot (two equal points)', () => {
    expect(finishStroke([[0.25, 0.75]], 2, 0.004, 0.66)?.p).toEqual([[0.25, 0.75], [0.25, 0.75]]);
  });
  it('is null when nothing was drawn', () => {
    expect(finishStroke([], 3, 0.004, 1)).toBeNull();
  });
  it('keeps the width inside the limits', () => {
    expect(finishStroke([[0, 0], [1, 1]], 1, 1, 1)?.w).toBe(STROKE_LIMITS.maxWidth);
    expect(finishStroke([[0, 0], [1, 1]], 1, 0, 1)?.w).toBe(STROKE_LIMITS.minWidth);
  });
  it('simplifies a long wiggly stroke well under the database limit', () => {
    const raw: [number, number][] = Array.from({ length: 5000 }, (_, i) => [i / 5000, 0.5 + 0.01 * Math.sin(i / 3)]);
    const s = finishStroke(raw, 1, 0.004, 0.7);
    expect(s).not.toBeNull();
    expect(s?.p.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(s?.p.length).toBeGreaterThanOrEqual(2);
  });
  it('drops repeated points', () => {
    expect(finishStroke([[0.1, 0.1], [0.1, 0.1], [0.4, 0.1]], 1, 0.004, 1)?.p).toEqual([[0.1, 0.1], [0.4, 0.1]]);
  });
});

describe('strokePath', () => {
  it('draws on a viewBox of 0 0 1 aspect', () => {
    expect(strokePath([[0, 0], [0.5, 1]], 0.5)).toBe('M0 0 L0.5 0.5');
  });
});

describe('undo history', () => {
  const a: Stroke = { c: 1, w: 0.004, p: [[0, 0], [1, 1]] };
  it('goes back one step at a time', () => {
    const past = rememberBefore(rememberBefore([], []), [a]);
    const one = undoStep(past);
    expect(one?.strokes).toEqual([a]);
    const two = undoStep(one?.past ?? []);
    expect(two?.strokes).toEqual([]);
    expect(undoStep(two?.past ?? [])).toBeNull();
  });
  it('keeps at most UNDO_DEPTH steps', () => {
    let past: Stroke[][] = [];
    for (let i = 0; i < UNDO_DEPTH + 10; i += 1) past = rememberBefore(past, []);
    expect(past.length).toBe(UNDO_DEPTH);
  });
});
