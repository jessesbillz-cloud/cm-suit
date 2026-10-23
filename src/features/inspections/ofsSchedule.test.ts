import { describe, expect, it } from 'vitest';
import { STATUS } from '../../lib/status';
import { requesterLine, schedChip, schedState, splitSchedule, whenLabel, type SchedState } from './ofsSchedule';

describe('schedule state', () => {
  it('mirrors ir_ofs_sched_state', () => {
    const cases: [string, string | null, string | null, SchedState][] = [
      ['pending', null, null, 'asked'],
      ['pending', null, 'proposed', 'proposed'],
      ['confirmed', null, 'proposed', 'confirmed'],
      ['confirmed', null, 'accepted', 'confirmed'],
      ['confirmed', null, null, 'confirmed'],
      ['postponed', null, 'proposed', 'postponed'],
      ['confirmed', 'approved', 'confirmed', 'done'],
      ['complete', null, null, 'done'],
      ['withdrawn', null, null, 'withdrawn'],
    ];
    for (const [status, result, sched, state] of cases) expect(schedState({ status, result, ofs_sched: sched })).toBe(state);
  });

  it('gives every state a lib/status color and a short word', () => {
    const states: SchedState[] = ['asked', 'confirmed', 'proposed', 'postponed', 'done', 'withdrawn'];
    for (const s of states) expect(STATUS[schedChip(s).status]).toBeDefined();
    expect(schedChip('proposed').label).toBe('Moved');
  });
});

describe('lines', () => {
  it('says the day and time, or the day alone', () => {
    expect(whenLabel('2026-10-27', '09:00:00')).toBe('Tue Oct 27, 9:00 AM');
    expect(whenLabel('2026-10-27', null)).toBe('Tue Oct 27');
  });

  it('gives the requester one line per state', () => {
    expect(requesterLine('asked', '2026-10-27', '09:00')).toBe('Asked for Tue Oct 27, 9:00 AM');
    expect(requesterLine('confirmed', '2026-10-27', '09:00')).toBe('Confirmed for Tue Oct 27, 9:00 AM');
    expect(requesterLine('proposed', '2026-10-28', '13:00')).toBe('OFS proposed Wed Oct 28, 1:00 PM');
    expect(requesterLine('done', '2026-10-28', '13:00')).toBeNull();
  });

  it('puts the ones with no time on top', () => {
    const rows = [
      { id: 'a', needs_time: true, request_date: '2026-10-27' },
      { id: 'b', needs_time: false, request_date: '2026-10-27' },
    ];
    const s = splitSchedule(rows);
    expect(s.needsTime.map((r) => r.id)).toEqual(['a']);
    expect(s.dated.map((r) => r.id)).toEqual(['b']);
  });
});
