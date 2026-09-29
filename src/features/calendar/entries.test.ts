import { describe, expect, it } from 'vitest';
import type { CalendarInspection, CalendarLine } from '../../data/calendar.types';
import { STATUS } from '../../lib/status';
import { bannerOf, buildEntries, dayCount, entriesByDay, groupOf, groupRequests, irKind, isLookahead, shortType, type IrEntry } from './entries';

const LA = 'America/Los_Angeles';
const JOBS = [
  { project_id: 'job-a', name: 'Sample Job A' },
  { project_id: 'job-b', name: 'Sample Job B' },
];

function ir(over: Partial<CalendarInspection> = {}): CalendarInspection {
  return {
    id: 'r1', number: 1, version: 1, full_detail: true, mine: false, is_block: false, request_date: '2026-09-30',
    start_time: '09:00:00', duration_kind: 'timed', duration_min: 60, kind: 'ior', special_kind: null, status: 'pending',
    status_key: 'pending', result: null, attendance: null, company: 'Sample Concrete Co', items: 'Footings', owner_id: null,
    helper_id: null, postpone_reason: null, postpone_until: null, attachment_ids: [], postpone_count: 0, project_id: 'job-a',
    ...over,
  };
}

function line(id: string, startsAt: string, over: Partial<CalendarLine> = {}): CalendarLine {
  return {
    id, project_id: 'job-a', kind: 'meetings', source_type: 'manual', source_id: null, title: id, location: null,
    starts_at: startsAt, ends_at: null, all_day: false, status: null, version: 1, project_name: 'Sample Job A', timezone: LA,
    ...over,
  };
}

const ALL_TYPES = ['inspections', 'special_inspections', 'meetings', 'deliveries', 'lookahead'];

describe('entries', () => {
  it('a job\'s requests replace its mirrored inspection lines; other jobs keep theirs', () => {
    const entries = buildEntries({
      lines: [
        line('IR 1 mirror', '2026-09-30T16:00:00Z', { kind: 'inspections', source_type: 'inspection_request', source_id: 'r1' }),
        line('B mirror', '2026-09-30T16:00:00Z', { project_id: 'job-b', kind: 'inspections', source_type: 'inspection_request', source_id: 'r9' }),
        line('OAC', '2026-09-30T17:00:00Z'),
      ],
      inspections: [ir()],
      loaded: new Set(['job-a']),
      types: ALL_TYPES,
      jobs: JOBS,
    });
    expect(entries.map((e) => (e.type === 'ir' ? `ir ${String(e.row.number)}` : e.line.title))).toEqual(['ir 1', 'B mirror', 'OAC']);
    expect(entries[0]?.projectName).toBe('Sample Job A');
  });

  it('inspections answer to their type toggles; blocked time goes with inspections', () => {
    const rows = [ir(), ir({ id: 'r2', kind: 'special', special_kind: 'Welding' }), ir({ id: 'b1', is_block: true, kind: 'block' })];
    const kinds = (types: string[]) =>
      buildEntries({ lines: [], inspections: rows, loaded: new Set(), types, jobs: JOBS }).map((e) => (e.type === 'ir' ? shortType(e.row) : ''));
    expect(kinds(['special_inspections'])).toEqual(['Welding']);
    expect(kinds(['inspections'])).toEqual(['IOR', 'Blocked']);
    expect(irKind({ kind: 'ofs' })).toBe('inspections');
  });

  it('a day: all day and Flexible first, then by time on the job\'s clock, requests before lines at the same time', () => {
    const entries = buildEntries({
      lines: [line('Meeting 9', '2026-09-30T16:00:00Z'), line('Milestone', '2026-09-30T07:00:00Z', { all_day: true })],
      inspections: [ir({ start_time: '09:00:00' }), ir({ id: 'r2', start_time: null, duration_kind: 'periodic' }), ir({ id: 'r3', start_time: '07:30:00' })],
      loaded: new Set(),
      types: ALL_TYPES,
      jobs: JOBS,
    });
    const day = entriesByDay(entries, ['2026-09-30']).get('2026-09-30') ?? [];
    expect(day.map((e) => (e.type === 'ir' ? e.row.id : e.line.title))).toEqual(['r2', 'Milestone', 'r3', 'r1', 'Meeting 9']);
  });

  it('banners: the type in its status colors (MDR), postponed paused, a plain line neutral', () => {
    const [confirmed, postponed, gc, other, meeting] = buildEntries({
      lines: [line('OAC', '2026-09-30T17:00:00Z')],
      inspections: [
        ir({ status: 'confirmed' }),
        ir({ id: 'r2', status: 'postponed', kind: 'special', special_kind: 'Concrete' }),
        ir({ id: 'r3', status: 'gc_review' }),
        ir({ id: null, number: null, full_detail: false, status: 'confirmed', status_key: 'approved' }),
      ],
      loaded: new Set(),
      types: ALL_TYPES,
      jobs: JOBS,
    });
    expect(confirmed && bannerOf(confirmed)).toEqual({ label: 'IOR', tone: 'confirmed', paused: false, kind: null });
    expect(postponed && bannerOf(postponed)).toEqual({ label: 'Concrete', tone: 'postponed', paused: true, kind: null });
    expect(gc && bannerOf(gc).tone).toBe('gc_review');
    expect(other && bannerOf(other).tone).toBe('approved');
    expect(meeting && bannerOf(meeting)).toEqual({ label: 'OAC', tone: null, paused: false, kind: 'meetings' });
    for (const e of [confirmed, postponed, gc, other]) {
      const tone = e ? bannerOf(e).tone : null;
      expect(tone !== null && STATUS[tone].solid).toBeTruthy();
    }
  });

  it('groups a day\'s requests by state, in order, and counts them', () => {
    const entries = buildEntries({
      lines: [],
      inspections: [
        ir({ id: 'd', status: 'complete', result: 'approved' }),
        ir({ id: 'f', status: 'confirmed', result: 'not_approved' }),
        ir({ id: 'c', status: 'confirmed' }),
        ir({ id: 'p', status: 'pending' }),
        ir({ id: 'g', status: 'gc_review' }),
        ir({ id: 'z', status: 'postponed' }),
        ir({ id: 'b', is_block: true, kind: 'block', status: 'blocked' }),
      ],
      loaded: new Set(),
      types: ALL_TYPES,
      jobs: JOBS,
    }).filter((e): e is IrEntry => e.type === 'ir');
    expect(groupRequests(entries).map((g) => `${g.group}:${g.entries.map((e) => e.row.id ?? '').join('')}`)).toEqual([
      'pending:pg', 'postponed:z', 'confirmed:c', 'done:df', 'blocked:b',
    ]);
    expect(groupOf({ is_block: false, status: 'returned', result: null })).toBe('pending');
    expect(dayCount(entries)).toBe('6 inspections · 2 pending');
    expect(dayCount([])).toBeNull();
  });

  it('the look-ahead is its own section', () => {
    const [look] = buildEntries({ lines: [line('Deck pour', '2026-09-30T07:00:00Z', { kind: 'lookahead', all_day: true })], inspections: [], loaded: new Set(), types: ALL_TYPES, jobs: JOBS });
    expect(look && isLookahead(look)).toBe(true);
  });
});
