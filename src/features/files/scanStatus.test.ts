import { describe, expect, it } from 'vitest';
import { opensBeforeScan, scanChip } from './scanStatus';

describe('scan status', () => {
  it('photos open before the scan; other files and look-alikes do not (same rule as authorize_download)', () => {
    expect(opensBeforeScan('image/jpeg', 'Sample slab 01.JPG')).toBe(true);
    expect(opensBeforeScan('image/heic', 'Sample wall.heic')).toBe(true);
    expect(opensBeforeScan('application/pdf', 'Sample notes.pdf')).toBe(false);
    expect(opensBeforeScan('image/jpeg', 'sample-photo.exe')).toBe(false);
    expect(opensBeforeScan('image/svg+xml', 'Sample.svg')).toBe(false);
  });
  it('an unfinished upload reads Uploading whatever the scan says', () => {
    expect(scanChip('clean', false).label).toBe('Uploading');
    expect(scanChip('infected', true).status).toBe('blocked');
  });
});
