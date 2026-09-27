import { describe, expect, it } from 'vitest';
import { endOfDayInZone, formatInZone, fromZonedInput, todayInZone, toZonedInput } from './dates';

const LA = 'America/Los_Angeles';

describe('dates', () => {
  it('a Pacific evening is still that day in the project zone, not tomorrow (UTC)', () => {
    // 2026-09-25 21:30 PDT = 2026-09-26 04:30 UTC
    expect(todayInZone(LA, new Date('2026-09-26T04:30:00Z'))).toBe('2026-09-25');
  });
  it('handles the spring-forward DST change', () => {
    // 2026-03-08 is the US DST start. 09:59 UTC = 01:59 PST, 10:00 UTC = 03:00 PDT.
    expect(formatInZone('2026-03-08T09:59:00Z', LA, 'yyyy-MM-dd HH:mm')).toBe('2026-03-08 01:59');
    expect(formatInZone('2026-03-08T10:00:00Z', LA, 'yyyy-MM-dd HH:mm')).toBe('2026-03-08 03:00');
  });
  it('ends a day at 23:59:59 project time', () => {
    expect(endOfDayInZone('2026-09-25', LA)).toBe('2026-09-26T06:59:59.000Z');
    expect(endOfDayInZone('2026-12-25', LA)).toBe('2026-12-26T07:59:59.000Z');
  });
  it('handles the fall-back DST change', () => {
    // 2026-11-01: 08:30 UTC = 01:30 PDT, 09:30 UTC = 01:30 PST.
    expect(formatInZone('2026-11-01T08:30:00Z', LA, 'HH:mm zzz')).toBe('01:30 PDT');
    expect(formatInZone('2026-11-01T09:30:00Z', LA, 'HH:mm zzz')).toBe('01:30 PST');
  });
  it('reads a bid due time typed in the job zone and shows it back the same', () => {
    expect(fromZonedInput('2026-10-15T14:00', LA)).toBe('2026-10-15T21:00:00.000Z');
    expect(fromZonedInput('2026-12-15T14:00', LA)).toBe('2026-12-15T22:00:00.000Z');
    expect(toZonedInput('2026-10-15T21:00:00Z', LA)).toBe('2026-10-15T14:00');
    expect(toZonedInput('2026-10-15T21:00:00Z', 'America/New_York')).toBe('2026-10-15T17:00');
    expect(fromZonedInput('', LA)).toBeNull();
    expect(() => fromZonedInput('tomorrow', LA)).toThrow();
  });
});
