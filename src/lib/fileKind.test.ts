import { describe, expect, it } from 'vitest';
import { fileKind } from './fileKind';

describe('fileKind', () => {
  it('photos by type and name', () => {
    expect(fileKind('Sample crack.jpg', 'image/jpeg')).toBe('image');
    expect(fileKind('fake.jpg', 'application/pdf')).toBe('other');
    expect(fileKind('logo.svg', 'image/svg+xml')).toBe('other');
  });
  it('PDFs by type and name', () => {
    expect(fileKind('Sample plan.PDF', 'application/pdf')).toBe('pdf');
    expect(fileKind('page.pdf', 'text/html')).toBe('other');
  });
  it('the name alone when the type is not known', () => {
    expect(fileKind('Sample field photo.jpg')).toBe('image');
    expect(fileKind('Sample mix design.pdf', null)).toBe('pdf');
    expect(fileKind('Sample schedule.xlsx', '')).toBe('other');
  });
});
