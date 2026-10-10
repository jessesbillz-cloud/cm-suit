import { describe, expect, it } from 'vitest';
import { formatDay, todayInZone } from './dates';
import { isWeekendDay, monthDays, parseDay, pickDay, placeFrom, placeSearch, rowsWithOpen, stepMonth, weekRows } from './monthGrid';

const LA = 'America/Los_Angeles';

describe('month grid: week rows', () => {
  it('whole weeks, Monday first, covering the month', () => {
    // Oct 1 2026 is a Thursday, Oct 31 a Saturday.
    const days = monthDays('2026-10-15');
    expect(days[0]).toBe('2026-09-28');
    expect(days[days.length - 1]).toBe('2026-11-01');
    const rows = weekRows(days);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toHaveLength(7);
      expect(formatDay(row[0] ?? '', 'EEE')).toBe('Mon');
      expect(formatDay(row[6] ?? '', 'EEE')).toBe('Sun');
    }
  });
  it('a month across six weeks, and one that is exactly four', () => {
    // Aug 1 2026 is a Saturday and Aug 31 a Monday: six rows.
    expect(weekRows(monthDays('2026-08-01'))).toHaveLength(6);
    expect(monthDays('2026-08-31')[0]).toBe('2026-07-27');
    // Feb 2027 starts on a Monday and ends on a Sunday: four rows, no other month's days.
    const feb = monthDays('2027-02-10');
    expect(feb).toHaveLength(28);
    expect(feb.every((d) => d.startsWith('2027-02'))).toBe(true);
  });
  it('a leap February ends on the 29th', () => {
    expect(monthDays('2028-02-01')).toContain('2028-02-29');
    expect(monthDays('2028-02-01')).not.toContain('2028-02-30');
  });
  it('weekends are Saturday and Sunday', () => {
    expect(weekRows(monthDays('2026-10-01'))[1]?.map(isWeekendDay)).toEqual([false, false, false, false, false, true, true]);
  });
});

describe('month grid: the open day row', () => {
  const weeks = weekRows(monthDays('2026-10-15'));
  it('goes right under the open day\'s week, and only there', () => {
    const rows = rowsWithOpen(weeks, '2026-10-14');
    expect(rows.map((r) => r.type)).toEqual(['week', 'week', 'week', 'open', 'week', 'week']);
    expect(rows[3]).toEqual({ type: 'open', day: '2026-10-14' });
    expect(rows[2]).toEqual({ type: 'week', days: weeks[2] });
  });
  it('no row when nothing is open, or the open day is not on screen', () => {
    expect(rowsWithOpen(weeks, null).every((r) => r.type === 'week')).toBe(true);
    expect(rowsWithOpen(weeks, '2026-12-01')).toHaveLength(weeks.length);
  });
  it('the first and last weeks of the month', () => {
    expect(rowsWithOpen(weeks, '2026-10-01').map((r) => r.type)).toEqual(['week', 'open', 'week', 'week', 'week', 'week']);
    expect(rowsWithOpen(weeks, '2026-10-31').map((r) => r.type).slice(-2)).toEqual(['week', 'open']);
  });
});

describe('month grid: moving', () => {
  it('previous and next keep the day, or the month\'s last day', () => {
    expect(stepMonth('2026-10-15', 1)).toBe('2026-11-15');
    expect(stepMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(stepMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(stepMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(stepMonth('2026-01-10', -1)).toBe('2025-12-10');
  });
  it('reads only real days from the URL', () => {
    expect(parseDay('2026-02-28')).toBe('2026-02-28');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('soon')).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });
  it('the place in the URL: the month around at, else the open day, else today', () => {
    expect(placeFrom({}, '2026-10-10')).toEqual({ anchor: '2026-10-10', open: null });
    expect(placeFrom({ day: '2026-11-03' }, '2026-10-10')).toEqual({ anchor: '2026-11-03', open: '2026-11-03' });
    expect(placeFrom({ at: '2026-12-01', day: '2026-11-03' }, '2026-10-10')).toEqual({ anchor: '2026-12-01', open: '2026-11-03' });
    expect(placeFrom({ at: '2026-02-30', day: null }, '2026-10-10')).toEqual({ anchor: '2026-10-10', open: null });
  });
  it('a tap opens a day; the same tap closes it; the month stays; Back has a URL for each', () => {
    const today = '2026-10-10';
    let place = placeFrom({}, today);
    place = pickDay(place, '2026-10-20');
    expect(placeSearch(place, today)).toEqual({ day: '2026-10-20' });
    place = pickDay(place, '2026-10-22');
    expect(placeSearch(place, today)).toEqual({ day: '2026-10-22' });
    place = pickDay(place, '2026-10-22');
    expect(place.open).toBeNull();
    expect(placeSearch(place, today)).toEqual({ at: '2026-10-22' });
    // Today, open, then closed: nothing left to say.
    place = pickDay(placeFrom({}, today), today);
    expect(placeSearch(place, today)).toEqual({ day: today });
    expect(placeSearch(pickDay(place, today), today)).toEqual({});
  });
  it('a month away keeps at; its open day is enough on its own', () => {
    const today = '2026-10-10';
    expect(placeSearch({ anchor: stepMonth(today, 1), open: null }, today)).toEqual({ at: '2026-11-10' });
    expect(placeSearch(pickDay({ anchor: '2026-11-10', open: null }, '2026-11-04'), today)).toEqual({ day: '2026-11-04' });
  });
});

describe('month grid: the job\'s time zone', () => {
  it('on Halloween evening in San Diego the month is still October (UTC says November)', () => {
    const now = new Date('2026-11-01T05:30:00Z');
    const la = placeFrom({}, todayInZone(LA, now));
    expect(la.anchor).toBe('2026-10-31');
    expect(monthDays(la.anchor)).toContain('2026-10-01');
    expect(rowsWithOpen(weekRows(monthDays(la.anchor)), la.anchor).map((r) => r.type).slice(-2)).toEqual(['week', 'open']);
    expect(placeFrom({}, todayInZone('UTC', now)).anchor).toBe('2026-11-01');
    expect(monthDays(todayInZone('UTC', now))[0]).toBe('2026-10-26');
  });
});
