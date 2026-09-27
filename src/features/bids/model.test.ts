import { describe, expect, it } from 'vitest';
import { nextPackageCode, parseRecipients, parseView } from './model';

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
