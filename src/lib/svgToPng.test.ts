import { describe, expect, it } from 'vitest';
import { svgCanvasSize } from './svgToPng';

describe('svgCanvasSize', () => {
  it('scales the SVG to a 1200px longest edge, keeping its shape', () => {
    expect(svgCanvasSize(300, 100)).toEqual({ width: 1200, height: 400 });
    expect(svgCanvasSize(4000, 8000)).toEqual({ width: 600, height: 1200 });
  });
  it('uses the browser default shape when the SVG has no size', () => {
    expect(svgCanvasSize(0, 0)).toEqual({ width: 1200, height: 600 });
  });
});
