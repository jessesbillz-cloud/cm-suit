import { describe, expect, it } from 'vitest';
import { clampPan, MAX_ZOOM, MIN_ZOOM, zoomStep } from './zoom';

describe('zoomStep', () => {
  it('steps by a quarter and stops at the fit on the way', () => {
    expect(zoomStep(1, 1)).toBe(1.25);
    expect(zoomStep(1.25, -1)).toBe(1);
    expect(zoomStep(0.9, 1)).toBe(1);
    expect(zoomStep(1.1, -1)).toBe(1);
  });
  it('stays between the limits', () => {
    expect(zoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(zoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe('clampPan', () => {
  it('keeps a fitted picture in the middle', () => {
    expect(clampPan({ x: 40, y: -40 }, { w: 400, h: 300 }, 1)).toEqual({ x: 0, y: 0 });
  });
  it('lets a zoomed picture move only as far as its edges', () => {
    expect(clampPan({ x: 500, y: -500 }, { w: 400, h: 300 }, 2)).toEqual({ x: 200, y: -150 });
    expect(clampPan({ x: 10, y: 20 }, { w: 400, h: 300 }, 2)).toEqual({ x: 10, y: 20 });
  });
});
