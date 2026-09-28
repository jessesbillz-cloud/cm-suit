import { describe, expect, it } from 'vitest';
import { byTime, countByDay, deliveryLinkUrl, durationLabel, findOverlap, monthDays, shiftDay, threeWeekDays } from './deliveries';

const at = (hhmm: string) => `2026-10-05T${hhmm}:00Z`;

describe('findOverlap', () => {
  const rows = [
    { id: 'a', starts_at: at('14:00'), duration_min: 60 },
    { id: 'b', starts_at: null, duration_min: 30 },
  ];
  it('finds a delivery that shares any minute', () => {
    expect(findOverlap(rows, { starts_at: at('14:30'), duration_min: 60 })?.id).toBe('a');
    expect(findOverlap(rows, { starts_at: at('13:30'), duration_min: 45 })?.id).toBe('a');
    expect(findOverlap(rows, { starts_at: at('13:00'), duration_min: 180 })?.id).toBe('a');
  });
  it('treats touching ranges as free, like the database', () => {
    expect(findOverlap(rows, { starts_at: at('15:00'), duration_min: 60 })).toBeNull();
    expect(findOverlap(rows, { starts_at: at('13:00'), duration_min: 60 })).toBeNull();
  });
  it('never flags a time TBD, on either side', () => {
    expect(findOverlap(rows, { starts_at: null, duration_min: 60 })).toBeNull();
    expect(findOverlap([{ id: 'b', starts_at: null, duration_min: 30 }], { starts_at: at('14:00'), duration_min: 60 })).toBeNull();
  });
  it('skips the delivery being edited', () => {
    expect(findOverlap(rows, { starts_at: at('14:15'), duration_min: 30 }, 'a')).toBeNull();
  });
});

describe('threeWeekDays', () => {
  it('starts on the Sunday of the anchor week and runs 21 days', () => {
    const days = threeWeekDays('2026-09-30'); // a Wednesday
    expect(days).toHaveLength(21);
    expect(days[0]).toBe('2026-09-27');
    expect(days[20]).toBe('2026-10-17');
  });
  it('keeps a Sunday anchor as the first day', () => {
    expect(threeWeekDays('2026-09-27')[0]).toBe('2026-09-27');
  });
  it('crosses month, year and daylight-saving boundaries day by day', () => {
    const days = threeWeekDays('2026-12-31');
    expect(days[0]).toBe('2026-12-27');
    expect(days).toContain('2027-01-01');
    const dst = threeWeekDays('2026-11-01');
    expect(new Set(dst).size).toBe(21);
    expect(dst[1]).toBe('2026-11-02');
  });
});

describe('days and counts', () => {
  it('shifts calendar days', () => {
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('lists a month', () => {
    expect(monthDays('2026-02-14')).toHaveLength(28);
    expect(monthDays('2026-10-05')[30]).toBe('2026-10-31');
  });
  it('counts per day', () => {
    const c = countByDay([{ delivery_date: '2026-10-05' }, { delivery_date: '2026-10-05' }, { delivery_date: '2026-10-06' }]);
    expect(c.get('2026-10-05')).toBe(2);
    expect(c.get('2026-10-07')).toBeUndefined();
  });
  it('orders a day by time, TBD last, then number', () => {
    const rows = [
      { number: 3, starts_at: null },
      { number: 2, starts_at: at('15:00') },
      { number: 1, starts_at: at('14:00') },
      { number: 4, starts_at: null },
    ];
    expect([...rows].sort(byTime).map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });
  it('rejects a day that is not yyyy-mm-dd', () => {
    expect(() => shiftDay('10/05/2026', 1)).toThrow();
  });
});

describe('labels and links', () => {
  it('labels durations', () => {
    expect(durationLabel(30)).toBe('30 min');
    expect(durationLabel(60)).toBe('1 hr');
    expect(durationLabel(90)).toBe('1.5 hr');
  });
  it('builds the link under the base path', () => {
    expect(deliveryLinkUrl('https://app.example.test', '/cm/', 'job-1', 'a_b-c')).toBe('https://app.example.test/cm/d/job-1?t=a_b-c');
    expect(deliveryLinkUrl('http://localhost:5173', '/', 'job-1', 'x')).toBe('http://localhost:5173/d/job-1?t=x');
  });
});
