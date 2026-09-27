import { describe, expect, it } from 'vitest';
import { groupKey, normalizeTotpCode, qrImageSrc } from './twoStep';

describe('normalizeTotpCode', () => {
  it('keeps exactly six digits, whatever is typed around them', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('12-34-56')).toBe('123456');
  });
  it('rejects anything but six digits', () => {
    expect(normalizeTotpCode('')).toBeNull();
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('1234567')).toBeNull();
    expect(normalizeTotpCode('abcdef')).toBeNull();
  });
});

describe('groupKey', () => {
  it('groups the key in fours', () => {
    expect(groupKey('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
    expect(groupKey('ABCD')).toBe('ABCD');
  });
  it('drops whitespace already there and handles an empty key', () => {
    expect(groupKey('AB CD EF')).toBe('ABCD EF');
    expect(groupKey('')).toBe('');
  });
});

describe('qrImageSrc', () => {
  it('percent-encodes a raw SVG data URL so # and % survive in an <img>', () => {
    const src = qrImageSrc('data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>');
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(src).not.toContain('#');
    expect(src).not.toContain('<');
    expect(decodeURIComponent(src.slice('data:image/svg+xml;charset=utf-8,'.length))).toContain('fill="#000"');
  });
  it('leaves an already encoded or foreign URL alone', () => {
    const encoded = 'data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E';
    expect(qrImageSrc(encoded)).toBe(encoded);
    const png = 'data:image/png;base64,AAAA';
    expect(qrImageSrc(png)).toBe(png);
  });
});
