import { describe, expect, it } from 'vitest';
import type { CalendarLine } from '../../data/calendar.types';
import { draftOf, fieldsOf, newDraft } from './draft';

const LA = 'America/Los_Angeles';

describe('manual line form', () => {
  it('a Pacific evening is saved as that evening, not a UTC day later', () => {
    const fields = fieldsOf({ ...newDraft('2026-10-05', 'meetings'), title: ' Sample walk ', start: '23:30', end: '23:45' }, LA);
    expect(fields).toEqual({
      kind: 'meetings',
      title: 'Sample walk',
      location: null,
      starts_at: '2026-10-06T06:30:00.000Z',
      ends_at: '2026-10-06T06:45:00.000Z',
      all_day: false,
    });
  });

  it('an all-day line starts at the job-local midnight, also on the day DST ends', () => {
    const fields = fieldsOf({ ...newDraft('2026-11-01', 'pours'), title: 'Pour', allDay: true }, LA);
    expect(fields).toMatchObject({ starts_at: '2026-11-01T07:00:00.000Z', ends_at: null, all_day: true });
  });

  it('reads a saved line back on the job clock', () => {
    const line: CalendarLine = {
      id: 'x',
      project_id: 'job-a',
      kind: 'milestones',
      source_type: 'manual',
      source_id: null,
      title: 'Sample',
      location: 'Gate 2',
      starts_at: '2026-11-01T09:30:00Z',
      ends_at: '2026-11-01T10:30:00Z',
      all_day: false,
      status: null,
      version: 3,
      project_name: 'Sample Job A',
      timezone: LA,
    };
    expect(draftOf(line)).toEqual({
      kind: 'milestones',
      title: 'Sample',
      day: '2026-11-01',
      allDay: false,
      start: '01:30',
      end: '02:30',
      location: 'Gate 2',
    });
  });

  it('says the one thing that is wrong', () => {
    const base = { ...newDraft('2026-10-05', 'meetings'), title: 'x' };
    expect(fieldsOf({ ...base, title: '  ' }, LA)).toEqual({ problem: 'Enter a title.' });
    expect(fieldsOf({ ...base, kind: 'deliveries' }, LA)).toEqual({ problem: 'Pick a type.' });
    expect(fieldsOf({ ...base, start: '10:00', end: '09:00' }, LA)).toEqual({ problem: 'End is before start.' });
    expect(fieldsOf({ ...base, day: '' }, LA)).toEqual({ problem: 'Pick a date.' });
  });
});
