import { describe, expect, it } from 'vitest';
import { fitWithin, jpegName } from './compressPhoto';

describe('compressPhoto helpers', () => {
  it('scales the longest edge down to the limit', () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('never scales up', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('renames to .jpg', () => {
    expect(jpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(jpegName('photo')).toBe('photo.jpg');
  });
});
