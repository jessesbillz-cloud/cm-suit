import { describe, expect, it } from 'vitest';
import { isPhotoFile } from './photos';

describe('isPhotoFile', () => {
  it('takes photos by type and name', () => {
    expect(isPhotoFile('Sample crack.jpg', 'image/jpeg')).toBe(true);
    expect(isPhotoFile('SAMPLE.JPEG', 'IMAGE/JPEG')).toBe(true);
    expect(isPhotoFile('sample.png', 'image/png')).toBe(true);
    expect(isPhotoFile('sample.heic', 'image/heic')).toBe(true);
  });
  it('never anything else', () => {
    expect(isPhotoFile('Sample ticket.pdf', 'application/pdf')).toBe(false);
    expect(isPhotoFile('fake.jpg', 'application/pdf')).toBe(false);
    expect(isPhotoFile('ticket.pdf', 'image/jpeg')).toBe(false);
    expect(isPhotoFile('logo.svg', 'image/svg+xml')).toBe(false);
    expect(isPhotoFile('photo.jpg', null)).toBe(false);
  });
});
