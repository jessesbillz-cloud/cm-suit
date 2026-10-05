import { describe, expect, it } from 'vitest';
import { canOpenNow, opensBeforeScan, scanChip } from './scanStatus';

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
  it("someone else's file still being scanned can't be opened yet; my own and photos can", () => {
    const pdf = { mime: 'application/pdf', original_name: 'Sample.pdf', scan_status: 'pending', upload_complete: true, created_by: 'them' };
    expect(canOpenNow(pdf, 'me')).toBe(false);
    expect(canOpenNow(pdf, 'them')).toBe(true);
    expect(canOpenNow({ ...pdf, mime: 'image/jpeg', original_name: 'Sample.jpg' }, 'me')).toBe(true);
    expect(canOpenNow({ ...pdf, scan_status: 'clean' }, 'me')).toBe(true);
    expect(canOpenNow({ ...pdf, scan_status: 'infected', created_by: 'me' }, 'me')).toBe(false);
    expect(canOpenNow({ ...pdf, scan_status: 'clean', upload_complete: false }, 'me')).toBe(false);
  });
});
