import { describe, expect, it } from 'vitest';
import { commentWhen } from './model';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-09-30T21:00:00Z');

describe('when a comment was written', () => {
  it('shows the day and time in the job zone, without this year', () => {
    expect(commentWhen('2026-09-30T21:14:00Z', TZ, NOW)).toBe('Sep 30, 2:14 PM');
  });

  it('uses the job zone for the day (an evening in California is the next day in UTC)', () => {
    expect(commentWhen('2026-10-01T02:30:00Z', TZ, NOW)).toBe('Sep 30, 7:30 PM');
  });

  it('adds the year for an earlier year (jobs run for years)', () => {
    expect(commentWhen('2025-12-31T20:00:00Z', TZ, NOW)).toBe('Dec 31, 2025, 12:00 PM');
  });
});
