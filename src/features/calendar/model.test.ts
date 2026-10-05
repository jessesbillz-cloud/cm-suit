import { describe, expect, it } from 'vitest';
import type { CalendarLine } from '../../data/calendar.types';
import {
  bucketByDay,
  inspectionJobs,
  isWeekendDay,
  lineChip,
  lineDay,
  lineTime,
  parseCalView,
  parseDay,
  parseRequestItem,
  rangeFor,
  rangeLabel,
  requestItemId,
  schedulingLink,
  statusKey,
  step,
  visibleDays,
  visibleLines,
} from './model';

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';

function line(id: string, startsAt: string, over: Partial<CalendarLine> = {}): CalendarLine {
  return {
    id,
    project_id: 'job-a',
    kind: 'meetings',
    source_type: 'manual',
    source_id: null,
    title: id,
    location: null,
    starts_at: startsAt,
    ends_at: null,
    all_day: false,
    status: null,
    version: 1,
    project_name: 'Sample Job A',
    timezone: LA,
    ...over,
  };
}

const titles = (m: Map<string, CalendarLine[]>, day: string) => (m.get(day) ?? []).map((l) => l.title);

describe('calendar days', () => {
  it('a week is Monday to Sunday around any day in it', () => {
    expect(visibleDays('week', '2026-09-30')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(visibleDays('week', '2026-10-04')[0]).toBe('2026-09-28');
  });

  it('Saturday and Sunday are the weekend', () => {
    expect(visibleDays('week', '2026-09-30').map(isWeekendDay)).toEqual([false, false, false, false, false, true, true]);
  });

  it('the week the clocks fall back has seven distinct days, none skipped', () => {
    const days = visibleDays('week', '2026-11-01');
    expect(days).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    const spring = visibleDays('week', '2026-03-08');
    expect(spring).toHaveLength(7);
    expect(new Set(spring).size).toBe(7);
  });

  it('a month is whole weeks covering it', () => {
    const days = visibleDays('month', '2026-10-15');
    expect(days[0]).toBe('2026-09-28');
    expect(days[days.length - 1]).toBe('2026-11-01');
    expect(days.length % 7).toBe(0);
  });

  it('prev / next move by the view', () => {
    expect(step('week', '2026-09-30', 1)).toBe('2026-10-07');
    expect(step('month', '2026-01-31', 1)).toBe('2026-02-28');
  });

  it('loads a day either side in UTC, so every job zone is covered', () => {
    expect(rangeFor(['2026-09-28', '2026-10-04'])).toEqual({ from: '2026-09-27T00:00:00.000Z', to: '2026-10-06T00:00:00.000Z' });
  });

  it('labels and views', () => {
    expect(rangeLabel('week', visibleDays('week', '2026-09-30'), '2026-09-30')).toBe('Sep 28 – Oct 4, 2026');
    expect(rangeLabel('week', visibleDays('week', '2026-12-30'), '2026-12-30')).toBe('Dec 28, 2026 – Jan 3, 2027');
    expect(rangeLabel('month', [], '2026-10-15')).toBe('October 2026');
    expect(parseCalView('week')).toBe('week');
    // The day view became the day under the grid; the month is the default (MDR).
    expect(parseCalView('day')).toBe('month');
    expect(parseCalView(undefined)).toBe('month');
  });

  it('a day in the address is used only when it is a real day', () => {
    expect(parseDay('2026-02-28')).toBe('2026-02-28');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('soon')).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it('a request opened from the calendar carries its job', () => {
    const id = requestItemId('11111111-2222-3333-4444-555555555555', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(parseRequestItem(id)).toEqual({ projectId: '11111111-2222-3333-4444-555555555555', requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(parseRequestItem('new')).toBeNull();
    expect(parseRequestItem('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBeNull();
  });

  it('share: the job\'s scheduling page under the app base path', () => {
    expect(schedulingLink('https://app.example.test', '/', 'job-a')).toBe('https://app.example.test/p/job-a/inspections?view=week');
    expect(schedulingLink('https://app.example.test', '/suite/', 'job-a')).toBe('https://app.example.test/suite/p/job-a/inspections?view=week');
  });

  it('only lib/status keys get a dot', () => {
    expect(statusKey('gc_review')).toBe('gc_review');
    expect(statusKey('confirmed')).toBe('confirmed');
    expect(statusKey('made_up')).toBeNull();
    expect(statusKey(null)).toBeNull();
  });

  it('a delivery reads Standby or nothing, and Time TBD instead of All day', () => {
    const delivery = (status: string | null, allDay: boolean) =>
      line('d', '2026-10-05T15:00:00Z', { kind: 'deliveries', source_type: 'delivery', source_id: 'd-1', status, all_day: allDay });
    expect(lineChip(delivery('confirmed', false))).toBeNull();
    expect(lineChip(delivery('pending', false))).toEqual({ status: 'pending', label: 'Standby' });
    expect(lineTime(delivery('confirmed', true))).toBe('Time TBD');
    // Everything else as before.
    expect(lineChip(line('m', '2026-10-05T15:00:00Z', { status: 'confirmed' }))).toEqual({ status: 'confirmed' });
    expect(lineTime(line('m', '2026-10-05T15:00:00Z', { all_day: true }))).toBe('All day');
  });
});

describe('bucketing lines into job-local days', () => {
  it('a Pacific evening stays on its day, not the UTC tomorrow', () => {
    // 2026-10-05 23:30 PDT = 2026-10-06 06:30 UTC.
    const evening = line('Pacific evening', '2026-10-06T06:30:00Z');
    expect(lineDay(evening)).toBe('2026-10-05');
    const days = visibleDays('week', '2026-10-05');
    const m = bucketByDay([evening], days);
    expect(titles(m, '2026-10-05')).toEqual(['Pacific evening']);
    expect(titles(m, '2026-10-06')).toEqual([]);
  });

  it('the same instant on an East Coast job is the next day there', () => {
    expect(lineDay(line('x', '2026-10-06T06:30:00Z', { timezone: NY }))).toBe('2026-10-06');
  });

  it('the week DST ends: lines land on their local day either side of the change', () => {
    const days = visibleDays('week', '2026-10-29'); // Oct 26 - Nov 1; clocks fall back Nov 1 at 2 am
    const lines = [
      line('Before the change', '2026-11-01T08:30:00Z'), // 01:30 PDT Nov 1
      line('After the change', '2026-11-01T09:30:00Z'), // 01:30 PST Nov 1
      line('Sunday night', '2026-11-02T07:30:00Z'), // 23:30 PST Nov 1
      line('Next Monday', '2026-11-02T08:30:00Z'), // 00:30 PST Nov 2, next week
      line('Saturday night', '2026-11-01T06:30:00Z'), // 23:30 PDT Oct 31
    ];
    const m = bucketByDay(lines, days);
    expect(titles(m, '2026-11-01')).toEqual(['Before the change', 'After the change', 'Sunday night']);
    expect(titles(m, '2026-10-31')).toEqual(['Saturday night']);
    expect([...m.values()].flat().map((l) => l.title)).not.toContain('Next Monday');
    // The range loaded for that week reaches the Sunday-night line.
    const r = rangeFor(days);
    expect('2026-11-02T07:30:00Z' < r.to).toBe(true);
  });

  it('a day lists all-day lines first, then by start, then by title', () => {
    const m = bucketByDay(
      [
        line('B 9am', '2026-09-30T16:00:00Z'),
        line('Z all day', '2026-09-30T07:00:00Z', { all_day: true }),
        line('A 9am', '2026-09-30T16:00:00Z'),
        line('7am', '2026-09-30T14:00:00Z'),
      ],
      ['2026-09-30'],
    );
    expect(titles(m, '2026-09-30')).toEqual(['Z all day', '7am', 'A 9am', 'B 9am']);
  });

  it('lines of two jobs in different zones share one day grid', () => {
    const m = bucketByDay(
      [line('LA 8pm', '2026-10-01T03:00:00Z'), line('NY 8pm', '2026-10-01T00:00:00Z', { timezone: NY })],
      visibleDays('week', '2026-09-30'),
    );
    expect(titles(m, '2026-09-30')).toEqual(['NY 8pm', 'LA 8pm']);
  });
});

describe('which lines a person sees', () => {
  const jobs = [
    { project_id: 'job-a', modules: ['calendar'] },
    { project_id: 'job-b', modules: ['files'] },
  ];
  const lines = [
    line('A meeting', '2026-09-30T16:00:00Z'),
    line('A pour', '2026-09-30T17:00:00Z', { kind: 'pours' }),
    line('B meeting', '2026-09-30T18:00:00Z', { project_id: 'job-b' }),
  ];
  const ids = (ls: readonly CalendarLine[]) => ls.map((l) => l.id);

  it('only the types they checked', () => {
    const jobA = lines.filter((l) => l.project_id === 'job-a');
    expect(ids(visibleLines(jobA, ['meetings'], jobs, 'job-a'))).toEqual(['A meeting']);
    expect(ids(visibleLines(jobA, [], jobs, 'job-a'))).toEqual([]);
  });

  it('on All my jobs, only jobs with the calendar on', () => {
    expect(ids(visibleLines(lines, ['meetings', 'pours'], jobs, null))).toEqual(['A meeting', 'A pour']);
  });

  it('inspections come from jobs with both the calendar and inspections on', () => {
    const field = [
      { project_id: 'job-a', modules: ['calendar', 'inspections'] },
      { project_id: 'job-b', modules: ['calendar'] },
      { project_id: 'job-c', modules: ['inspections'] },
    ];
    expect(inspectionJobs(field, null)).toEqual(['job-a']);
    expect(inspectionJobs(field, 'job-a')).toEqual(['job-a']);
    expect(inspectionJobs(field, 'job-b')).toEqual([]);
  });
});
