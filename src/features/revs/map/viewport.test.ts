import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, cappedDensity, clampView, fitSize, fitView, pinchView, toPage, viewOn, visibleRegion, zoomAt } from './viewport';

const frame = { w: 400, h: 800 };
const fit = fitSize(0.75, frame); // 400 x 300

describe('fitSize / fitView', () => {
  it('fits the page inside the frame and centers it', () => {
    expect(fit).toEqual({ w: 400, h: 300 });
    expect(fitView(fit, frame)).toEqual({ x: 0, y: 250, z: 1 });
    expect(fitSize(2, { w: 400, h: 400 })).toEqual({ w: 200, h: 400 });
  });
  it('is empty before the frame has a size', () => {
    expect(fitSize(0.75, { w: 0, h: 0 })).toEqual({ w: 0, h: 0 });
  });
});

describe('clampView', () => {
  it('never zooms out past the whole page or in past MAX_ZOOM', () => {
    expect(clampView({ x: 0, y: 0, z: 0.2 }, fit, frame).z).toBe(1);
    expect(clampView({ x: 0, y: 0, z: 99 }, fit, frame).z).toBe(MAX_ZOOM);
  });
  it('keeps a zoomed page covering the frame', () => {
    const v = clampView({ x: 50, y: 0, z: 4 }, fit, frame); // 1600 x 1200
    expect(v.x).toBe(0);
    expect(clampView({ x: -5000, y: -5000, z: 4 }, fit, frame)).toEqual({ x: -1200, y: -400, z: 4 });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor where it is', () => {
    const v0 = { x: 0, y: 250, z: 1 };
    const before = toPage(v0, fit, 200, 400);
    const v1 = zoomAt(v0, 200, 400, 2, fit, frame);
    const after = toPage(v1, fit, 200, 400);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });
});

describe('pinchView', () => {
  it('spreading two fingers zooms around their midpoint', () => {
    const v0 = { x: 0, y: 250, z: 1 };
    const v1 = pinchView(v0, { x: 150, y: 400 }, { x: 250, y: 400 }, { x: 100, y: 400 }, { x: 300, y: 400 }, fit, frame);
    expect(v1.z).toBe(2);
    const p = toPage(v1, fit, 200, 400);
    expect(p[0]).toBeCloseTo(0.5, 6);
    expect(p[1]).toBeCloseTo(0.5, 6);
  });
  it('moving both fingers together pans', () => {
    const v0 = { x: -400, y: -50, z: 3 };
    const v1 = pinchView(v0, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 120 }, { x: 230, y: 120 }, fit, frame);
    expect(v1.z).toBe(3);
    expect(v1.x).toBeCloseTo(-370, 6);
    expect(v1.y).toBeCloseTo(-30, 6);
  });
});

describe('toPage / visibleRegion', () => {
  it('maps the frame to page fractions', () => {
    expect(toPage({ x: 0, y: 250, z: 1 }, fit, 400, 550)).toEqual([1, 1]);
  });
  it('is the part of the page in view, in fit pixels', () => {
    expect(visibleRegion({ x: -400, y: -300, z: 2 }, fit, frame)).toEqual({ x: 200, y: 150, w: 200, h: 150 });
    expect(visibleRegion({ x: 0, y: 250, z: 1 }, fit, frame)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});

describe('cappedDensity', () => {
  it('stays under the pixel budget', () => {
    expect(cappedDensity(1000 * 1000, 2, 8_000_000)).toBe(2);
    expect(cappedDensity(2000 * 2000, 3, 8_000_000)).toBeCloseTo(Math.sqrt(2), 6);
  });
});

describe('viewOn', () => {
  it('centers a part of the page, zoomed so it fills about half the frame', () => {
    // A box 0.2 x 0.2 of the page in the middle: 80 x 60 fit pixels; half the frame across is 200 -> 2.5x.
    const v = viewOn({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, fit, frame);
    expect(v.z).toBe(2.5);
    expect(v.x).toBe(200 - 200 * 2.5);
    expect(v.y).toBe(400 - 150 * 2.5);
  });
  it('fills as much of the frame as asked: a page-high band fills the frame top to bottom', () => {
    // The page is 300 high in an 800-high frame: 800 / 300.
    expect(viewOn({ x: 0.5, y: 0, w: 0, h: 1 }, fit, frame, 1).z).toBeCloseTo(800 / 300, 6);
  });
  it('never past 4x for one short wall, nor out past the whole page', () => {
    expect(viewOn({ x: 0.5, y: 0.5, w: 0.001, h: 0 }, fit, frame).z).toBe(4);
    expect(viewOn({ x: 0, y: 0, w: 1, h: 1 }, fit, frame)).toEqual(fitView(fit, frame));
  });
});
