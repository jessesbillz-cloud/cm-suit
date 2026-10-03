import { describe, expect, it } from 'vitest';
import { boundsOf, circle, convexHull, depthOf, extrude, facesViewer, pathOf, project, rect, shadeOf, signedArea, VIEW } from './iso';

describe('the projection', () => {
  it('draws the wall rising gently to the right, through it up and left, and up straight up', () => {
    const [x0, y0] = project([0, 0, 0]);
    expect([x0, y0]).toEqual([0, 0]);
    const along = project([10, 0, 0]);
    expect(along[0]).toBeGreaterThan(0);
    expect(along[1]).toBeLessThan(0);
    const back = project([0, 10, 0]);
    expect(back[0]).toBeLessThan(0);
    expect(back[1]).toBeLessThan(0);
    const up = project([0, 0, 10]);
    expect(up[0]).toBeCloseTo(0);
    expect(up[1]).toBeLessThan(0);
  });

  it('looks from the front, the left and above: a unit view direction the projection flattens', () => {
    expect(Math.hypot(...VIEW)).toBeCloseTo(1, 6);
    expect(VIEW[0]).toBeGreaterThan(0);
    expect(VIEW[1]).toBeGreaterThan(0);
    expect(VIEW[2]).toBeLessThan(0);
    const p = project([VIEW[0] * 7, VIEW[1] * 7, VIEW[2] * 7]);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(0, 6);
  });

  it('sees the front, the left end and the top; not the back, the right end or the bottom', () => {
    expect(facesViewer([0, -1, 0])).toBe(true);
    expect(facesViewer([-1, 0, 0])).toBe(true);
    expect(facesViewer([0, 0, 1])).toBe(true);
    expect(facesViewer([0, 1, 0])).toBe(false);
    expect(facesViewer([1, 0, 0])).toBe(false);
    expect(facesViewer([0, 0, -1])).toBe(false);
  });

  it('puts farther points deeper', () => {
    expect(depthOf([0, 10, 0])).toBeGreaterThan(depthOf([0, 0, 0]));
    expect(depthOf([0, 0, 10])).toBeLessThan(depthOf([0, 0, 0]));
  });

  it('shades tops lightest and left ends darkest', () => {
    const top = shadeOf([0, 0, 1]);
    const front = shadeOf([0, -1, 0]);
    const left = shadeOf([-1, 0, 0]);
    expect(top).toBeLessThan(front);
    expect(front).toBeLessThan(left);
    expect(left).toBeLessThanOrEqual(0.16);
    expect(top).toBeGreaterThanOrEqual(0);
  });
});

describe('extrude', () => {
  it('a box through the wall shows three faces, the front cap last', () => {
    const faces = extrude(rect(0, 0, 10, 20), 'y', 0, 4);
    expect(faces).toHaveLength(3);
    expect(faces[faces.length - 1]?.kind).toBe('cap');
    expect(faces[faces.length - 1]?.normal).toEqual([-0, -1, -0]);
    for (const f of faces) expect(f.pts).toHaveLength(4);
  });

  it('winds either way and still finds the outside', () => {
    const cw = [...rect(0, 0, 10, 20)].reverse();
    expect(signedArea(cw)).toBeLessThan(0);
    expect(extrude(cw, 'y', 0, 4).map((f) => f.normal)).toEqual(extrude(rect(0, 0, 10, 20), 'y', 0, 4).map((f) => f.normal));
  });

  it('keeps only the cap, or drops the faces looking down or up', () => {
    expect(extrude(rect(0, 0, 10, 20), 'y', 0, 4, 'cap')).toHaveLength(1);
    expect(extrude(rect(0, 0, 10, 20), 'y', 0, 4, 'no-top').some((f) => f.normal[2] > 0)).toBe(false);
    // A V notch in the underside: its downward faces go.
    const notched = [[0, 0], [4, 0], [5, 2], [6, 0], [10, 0], [10, 5], [0, 5]] as const;
    expect(extrude(notched, 'y', 0, 4, 'no-under').some((f) => f.normal[2] < 0)).toBe(false);
  });

  it('an upright pipe shows its top and the half of its sides toward the viewer', () => {
    const faces = extrude(circle(0, 0, 2, 12), 'z', 0, 30);
    const caps = faces.filter((f) => f.kind === 'cap');
    expect(caps).toHaveLength(1);
    expect(caps[0]?.normal).toEqual([0, 0, 1]);
    const sides = faces.filter((f) => f.kind === 'side').length;
    expect(sides).toBeGreaterThan(3);
    expect(sides).toBeLessThan(10);
  });
});

describe('outline helpers', () => {
  it('the convex hull of a square and its middle is the square', () => {
    const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    expect(hull).toHaveLength(4);
    expect(boundsOf(hull)).toEqual({ minX: 0, minY: 0, maxX: 2, maxY: 2 });
  });

  it('writes a closed path to 0.01', () => {
    expect(pathOf([[0, 0], [1.234, 5.678], [2, 0]])).toBe('M0 0L1.23 5.68L2 0Z');
  });

  it('a circle of n points, all on its radius', () => {
    const c = circle(5, 5, 3, 8);
    expect(c).toHaveLength(8);
    for (const [x, y] of c) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(3, 9);
  });
});
