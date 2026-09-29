import { describe, expect, it } from 'vitest';
import { TODAY_ACTIONS, TODAY_CHIPS, scheduleLabel, todayMeta, todayState } from './dailyToday';

describe('todayState', () => {
  it("follows today's report, then the schedule", () => {
    expect(todayState({ status: 'submitted', scheduled_today: false })).toBe('submitted');
    expect(todayState({ status: 'draft', scheduled_today: true })).toBe('draft');
    expect(todayState({ status: 'none', scheduled_today: true })).toBe('due');
    expect(todayState({ status: 'none', scheduled_today: false })).toBe('off');
  });

  it('wears the status colors and one button per state', () => {
    expect(TODAY_CHIPS.submitted).toEqual({ status: 'confirmed', label: 'Submitted' });
    expect(TODAY_CHIPS.draft).toEqual({ status: 'pending', label: 'Draft' });
    expect(TODAY_CHIPS.due.label).toBe('Not started');
    expect(TODAY_CHIPS.off.label).toBe('Off today');
    expect([TODAY_ACTIONS.due, TODAY_ACTIONS.off, TODAY_ACTIONS.draft, TODAY_ACTIONS.submitted]).toEqual(['Start', 'Start', 'Continue', 'View']);
  });
});

describe('scheduleLabel', () => {
  it('reads a run, every day, a list, or none', () => {
    expect(scheduleLabel([1, 2, 3, 4, 5])).toBe('Daily M-F');
    expect(scheduleLabel([5, 4, 3, 2, 1, 1])).toBe('Daily M-F');
    expect(scheduleLabel([1, 2, 3, 4, 5, 6])).toBe('Daily M-Sa');
    expect(scheduleLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(scheduleLabel([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(scheduleLabel([2, 3])).toBe('Tue, Wed');
    expect(scheduleLabel([])).toBe('No schedule');
    expect(scheduleLabel([9, -1])).toBe('No schedule');
  });
});

describe('todayMeta', () => {
  it("says today's number, or the one it will get, then the schedule", () => {
    expect(todayMeta({ number: null, next_number: 233, schedule_days: [1, 2, 3, 4, 5] })).toBe('#233 · Daily M-F');
    expect(todayMeta({ number: 232, next_number: null, schedule_days: [0, 1, 2, 3, 4, 5, 6] })).toBe('#232 · Every day');
    expect(todayMeta({ number: null, next_number: null, schedule_days: [] })).toBe('No schedule');
  });
});
