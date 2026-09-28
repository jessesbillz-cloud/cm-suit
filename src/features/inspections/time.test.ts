import { describe, expect, it } from 'vitest';
import {
  TIME_OPTIONS,
  clockLabel,
  conflictsWith,
  durationLabel,
  durationOf,
  durationValue,
  monthOf,
  requestDay,
  spanOf,
  timeValue,
  weekOf,
  whenOf,
  type ConflictRow,
} from './time';

function row(p: Partial<ConflictRow>): ConflictRow {
  return { id: null, status: 'pending', status_key: 'pending', is_block: false, start_time: '09:00:00', duration_kind: 'timed', duration_min: 60, ...p };
}

describe('time slots and lengths', () => {
  it('offers Flexible and every half hour 6 AM to 6 PM', () => {
    expect(TIME_OPTIONS[0]).toEqual({ value: 'flexible', label: 'Flexible' });
    expect(TIME_OPTIONS[1]).toEqual({ value: '06:00', label: '6:00 AM' });
    expect(TIME_OPTIONS.at(-1)).toEqual({ value: '18:00', label: '6:00 PM' });
    expect(TIME_OPTIONS).toHaveLength(26);
  });
  it('labels clock times', () => {
    expect(clockLabel(null)).toBe('Flexible');
    expect(clockLabel('12:30:00')).toBe('12:30 PM');
    expect(clockLabel('00:00')).toBe('12:00 AM');
    expect(timeValue('13:30:00')).toBe('13:30');
    expect(timeValue(null)).toBe('flexible');
  });
  it('round-trips lengths', () => {
    expect(durationOf('90')).toEqual({ kind: 'timed', min: 90 });
    expect(durationOf('all_day')).toEqual({ kind: 'all_day', min: null });
    expect(durationValue('periodic', null)).toBe('periodic');
    expect(durationLabel('timed', 5)).toBe('5 min');
    expect(durationLabel('periodic', null)).toBe('Periodic / as needed');
    expect(() => durationOf('7')).toThrow();
  });
});

describe('slot conflicts', () => {
  const mine = { start_time: '09:30', duration_kind: 'timed', duration_min: 60 };
  it('finds an overlapping booking and ignores ones that only touch', () => {
    const hit = row({ start_time: '10:00:00', duration_min: 30 });
    const touching = row({ start_time: '10:30:00' });
    expect(conflictsWith(mine, [hit, touching])).toEqual([hit]);
  });
  it('postponed requests have freed their slot; returned ones never held it', () => {
    expect(conflictsWith(mine, [row({ status: 'postponed', status_key: 'postponed' }), row({ status: 'returned', status_key: 'blocked' })])).toEqual([]);
  });
  it('Flexible overlaps nothing; all-day and blocked time overlap everything timed', () => {
    const allDay = row({ start_time: null, duration_kind: 'all_day', duration_min: null });
    const block = row({ is_block: true, status: 'blocked', status_key: 'blocked', start_time: '09:00:00', duration_min: 60 });
    expect(conflictsWith({ start_time: null, duration_kind: 'timed', duration_min: 60 }, [allDay, block])).toEqual([]);
    expect(conflictsWith(mine, [allDay, block])).toEqual([allDay, block]);
  });
  it('a request never conflicts with itself (moving it)', () => {
    expect(conflictsWith(mine, [row({ id: 'r1' })], 'r1')).toEqual([]);
  });
  it('periodic takes a half hour from its start; flexible has no span', () => {
    expect(spanOf({ start_time: '08:00', duration_kind: 'periodic', duration_min: null })).toEqual({ start: 480, end: 510 });
    expect(spanOf({ start_time: null, duration_kind: 'timed', duration_min: 60 })).toBeNull();
  });
});

describe('days', () => {
  it('weeks run Monday to Sunday, across a month and a DST change', () => {
    expect(weekOf('2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(weekOf('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(weekOf('2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });
  it('months', () => {
    expect(monthOf('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('turns the picked fields into a request time', () => {
    expect(whenOf({ date: '2026-10-01', time: 'flexible', duration: 'all_day' })).toEqual({
      date: '2026-10-01', startTime: null, durationKind: 'all_day', durationMin: null,
    });
    expect(whenOf({ date: '2026-10-01', time: '09:30', duration: '90' })).toEqual({
      date: '2026-10-01', startTime: '09:30', durationKind: 'timed', durationMin: 90,
    });
  });
  it('a new request starts on the day being viewed, never in the past', () => {
    expect(requestDay('2026-10-05', '2026-10-01')).toBe('2026-10-05');
    expect(requestDay('2026-09-20', '2026-10-01')).toBe('2026-10-01');
  });
});
