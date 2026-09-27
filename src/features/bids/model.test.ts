import { describe, expect, it } from 'vitest';
import { isUnread, nextPackageCode, parseRecipients, parseView, readChip } from './model';

describe('readChip / isUnread', () => {
  it('follows the findings first, then the file text', () => {
    expect(readChip({ status: 'confirmed' }, 'done').label).toBe('Confirmed');
    expect(readChip({ status: 'draft' }, 'none').label).toBe('Read');
    expect(readChip(undefined, 'none').label).toBe("Can't read");
    expect(readChip(undefined, 'failed').label).toBe("Can't read");
    expect(readChip(undefined, 'pending').label).toBe('Not read');
    expect(readChip(undefined, undefined).label).toBe('Not read');
  });
  it('reads only what has no findings and might have text', () => {
    expect(isUnread(undefined, 'pending')).toBe(true);
    expect(isUnread(undefined, undefined)).toBe(true);
    expect(isUnread(undefined, 'none')).toBe(false);
    expect(isUnread({ status: 'draft' }, 'done')).toBe(false);
  });
});

describe('nextPackageCode', () => {
  it('starts at 01A', () => {
    expect(nextPackageCode([])).toBe('01A');
  });
  it('follows the highest code and skips taken ones', () => {
    expect(nextPackageCode(['01A', '02A'])).toBe('02B');
    expect(nextPackageCode(['02Y', '02Z'])).toBe('03A');
  });
});

describe('parseRecipients', () => {
  it('reads plain and "Company <email>" lines, drops duplicates, reports bad lines', () => {
    const r = parseRecipients('a@example.test\nSample Co <B@Example.test>\n\nnot an email\na@example.test');
    expect(r.recipients).toEqual([{ email: 'a@example.test' }, { email: 'b@example.test', company: 'Sample Co' }]);
    expect(r.bad).toEqual(['not an email']);
  });
});

describe('parseView', () => {
  it('falls back to coverage', () => {
    expect(parseView(undefined)).toBe('coverage');
    expect(parseView('nope')).toBe('coverage');
    expect(parseView('addenda')).toBe('addenda');
  });
});
