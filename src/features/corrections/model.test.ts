import { describe, expect, it } from 'vitest';
import { CORRECTION_STATUSES, type CorrectionHistoryRow, type CorrectionRow } from '../../data/corrections.types';
import { weekStartInZone } from '../../lib/dates';
import { STATUS } from '../../lib/status';
import {
  canEdit,
  cnLabel,
  latestStep,
  logSummary,
  matches,
  neighbors,
  nextSort,
  openTarget,
  parseSort,
  parseTags,
  prefill,
  sortCorrections,
  sortParam,
  statusChip,
  stepsFor,
  visibleRows,
  weeklySnapshot,
  type Caps,
} from './model';

function row(p: Partial<CorrectionRow> & { number: number }): CorrectionRow {
  return {
    id: `id-${String(p.number)}`,
    project_id: 'job',
    title: `Sample item ${String(p.number)}`,
    description: '',
    photo_ids: [],
    status: 'open',
    trade: '',
    location: '',
    spec_tags: [],
    notice_file_id: null,
    notice_ref: '',
    created_by: 'u-inspector',
    created_at: '2026-09-20T16:00:00Z',
    closed_at: null,
    version: 1,
    ...p,
  };
}

const INSPECTOR: Caps = { view: true, create: true, markReady: false, close: true };
const SUB: Caps = { view: true, create: false, markReady: true, close: false };
const GC: Caps = { view: true, create: true, markReady: true, close: false };

describe('labels and chips', () => {
  it('numbers read CN-001 and are never cut', () => {
    expect([1, 42, 1000].map(cnLabel)).toEqual(['CN-001', 'CN-042', 'CN-1000']);
  });
  it('every status maps to an existing lib/status color, with its own label', () => {
    const chips = CORRECTION_STATUSES.map(statusChip);
    for (const c of chips) expect(Object.keys(STATUS)).toContain(c.status);
    expect(new Set(chips.map((c) => c.label)).size).toBe(CORRECTION_STATUSES.length);
    expect(statusChip('open').status).toBe('pending');
    expect(statusChip('signed_off').status).toBe('confirmed');
    expect(statusChip('reopened').status).toBe('not_approved');
  });
});

describe('steps', () => {
  it('only the inspector (corrections.close) gets Corrected, Sign off and Reopen', () => {
    expect(stepsFor('ready', INSPECTOR)).toEqual(['corrected', 'signed_off', 'reopened']);
    expect(stepsFor('open', INSPECTOR)).toEqual(['corrected', 'signed_off']);
    expect(stepsFor('signed_off', INSPECTOR)).toEqual(['reopened']);
    expect(stepsFor('ready', SUB)).toEqual([]);
    expect(stepsFor('ready', GC)).toEqual([]);
  });
  it('a sub or the GC marks an open or reopened item ready', () => {
    expect(stepsFor('open', SUB)).toEqual(['ready']);
    expect(stepsFor('reopened', GC)).toEqual(['ready']);
    expect(stepsFor('corrected', SUB)).toEqual([]);
  });
  it('the creator or an inspector edits', () => {
    const r = row({ number: 1, created_by: 'u-pm' });
    expect(canEdit(r, 'u-pm', GC)).toBe(true);
    expect(canEdit(r, 'u-other-pm', GC)).toBe(false);
    expect(canEdit(r, 'u-sub', SUB)).toBe(false);
    expect(canEdit(r, 'u-inspector', INSPECTOR)).toBe(true);
  });
});

describe('sorting', () => {
  const rows = [
    row({ number: 9, title: 'beta', trade: 'Sample Drywall', status: 'ready', closed_at: null }),
    row({ number: 10, title: 'Alpha', trade: '', status: 'signed_off', closed_at: '2026-09-22T16:00:00Z' }),
    row({ number: 2, title: 'gamma', trade: 'Sample Concrete', status: 'open', closed_at: null }),
  ];
  const nums = (rs: CorrectionRow[]) => rs.map((r) => r.number);

  it('numbers sort as numbers', () => {
    expect(nums(sortCorrections(rows, { key: 'number', dir: 'asc' }))).toEqual([2, 9, 10]);
    expect(nums(sortCorrections(rows, { key: 'number', dir: 'desc' }))).toEqual([10, 9, 2]);
  });
  it('titles sort without case', () => {
    expect(nums(sortCorrections(rows, { key: 'title', dir: 'asc' }))).toEqual([10, 9, 2]);
  });
  it('empty values go last either way', () => {
    expect(nums(sortCorrections(rows, { key: 'trade', dir: 'asc' }))).toEqual([2, 9, 10]);
    expect(nums(sortCorrections(rows, { key: 'trade', dir: 'desc' }))).toEqual([9, 2, 10]);
    expect(nums(sortCorrections(rows, { key: 'closed', dir: 'desc' }))).toEqual([10, 9, 2]);
  });
  it('status follows the workflow: open, reopened, ready, corrected, signed off', () => {
    expect(nums(sortCorrections(rows, { key: 'status', dir: 'asc' }))).toEqual([2, 9, 10]);
  });
  it('the URL keeps only a non-default sort, and bad values fall back', () => {
    expect(sortParam({ key: 'number', dir: 'desc' })).toBeUndefined();
    expect(parseSort(sortParam({ key: 'trade', dir: 'asc' }))).toEqual({ key: 'trade', dir: 'asc' });
    expect(parseSort('nonsense.up')).toEqual({ key: 'number', dir: 'desc' });
    expect(nextSort({ key: 'number', dir: 'desc' }, 'title')).toEqual({ key: 'title', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'title')).toEqual({ key: 'title', dir: 'desc' });
  });
});

describe('search', () => {
  const r = row({ number: 7, title: 'Firestop gap at duct', trade: 'Sample Drywall', location: 'Level 2 corridor', spec_tags: ['07 84 00'] });
  it('finds by number in any usual form', () => {
    for (const q of ['CN-7', 'cn-007', 'cn 7', '7', '#7']) expect(matches(r, q)).toBe(true);
  });
  it('finds by title, trade, location and spec tag, without case', () => {
    for (const q of ['firestop', 'DRYWALL', 'corridor', '84 00']) expect(matches(r, q)).toBe(true);
    expect(matches(r, 'roofing')).toBe(false);
    expect(matches(r, '  ')).toBe(true);
  });
  it('Enter opens the exact number, else the only match', () => {
    const rows = [r, row({ number: 17, title: 'Missing hanger' })];
    expect(openTarget(rows, visibleRows(rows, '7', { key: 'number', dir: 'desc' }), '7')?.number).toBe(7);
    expect(openTarget(rows, visibleRows(rows, 'hanger', { key: 'number', dir: 'desc' }), 'hanger')?.number).toBe(17);
    expect(openTarget(rows, visibleRows(rows, 'a', { key: 'number', dir: 'desc' }), 'a')).toBeUndefined();
  });
  it('arrow keys follow the order shown', () => {
    const shown = [row({ number: 3 }), row({ number: 2 }), row({ number: 1 })];
    expect(neighbors(shown, 'id-2')).toEqual({ prev: 'id-3', next: 'id-1' });
    expect(neighbors(shown, 'id-3')).toEqual({ prev: null, next: 'id-2' });
    expect(neighbors(shown, 'id-gone')).toEqual({ prev: null, next: null });
  });
});

describe('new item and history', () => {
  it('prefills trade and location from my latest item', () => {
    const rows = [
      row({ number: 1, created_by: 'me', trade: 'Old trade', location: 'Old place' }),
      row({ number: 2, created_by: 'me', trade: 'Sample Drywall', location: 'Level 2' }),
      row({ number: 3, created_by: 'someone', trade: 'Other', location: 'Elsewhere' }),
    ];
    expect(prefill(rows, 'me')).toEqual({ trade: 'Sample Drywall', location: 'Level 2' });
    expect(prefill(rows, 'new-person')).toEqual({ trade: '', location: '' });
  });
  it('reads spec tags from one line', () => {
    expect(parseTags(' 07 84 00, 09 21 16; 07 84 00 ,')).toEqual(['07 84 00', '09 21 16']);
  });
  it('the latest step skips undone ones', () => {
    const h = (seq: number, action: CorrectionHistoryRow['action'], undoes: string | null = null): CorrectionHistoryRow => ({
      id: `h${String(seq)}`, seq, correction_id: 'c', actor_user_id: 'u', action, from_status: null, to_status: null, note: '',
      photo_ids: [], created_at: '2026-09-20T16:00:00Z', undoes,
    });
    expect(latestStep([h(1, 'created'), h(2, 'ready'), h(3, 'signed_off'), h(4, 'undone', 'h3')])?.id).toBe('h2');
    expect(latestStep([h(1, 'created'), h(2, 'edited')])).toBeUndefined();
  });
});

describe('weekly snapshot', () => {
  const LA = 'America/Los_Angeles';
  it('the week starts Monday 00:00 in the project zone', () => {
    // Sunday 2026-09-27 20:00 PDT is already Monday in UTC; the week still began on Monday the 21st, Pacific.
    expect(weekStartInZone(LA, new Date('2026-09-28T03:00:00Z'))).toBe('2026-09-21T07:00:00.000Z');
    expect(weekStartInZone(LA, new Date('2026-09-28T16:00:00Z'))).toBe('2026-09-28T07:00:00.000Z');
  });
  it('counts by status, opened and closed this week, and lists what is open', () => {
    const start = weekStartInZone(LA, new Date('2026-09-24T18:00:00Z'));
    const rows = [
      row({ number: 1, status: 'signed_off', created_at: '2026-09-10T16:00:00Z', closed_at: '2026-09-22T16:00:00Z' }),
      row({ number: 2, status: 'ready', created_at: '2026-09-22T16:00:00Z' }),
      row({ number: 3, status: 'open', created_at: '2026-09-21T06:00:00Z' }),
      row({ number: 4, status: 'corrected', created_at: '2026-09-01T16:00:00Z', closed_at: '2026-09-02T16:00:00Z' }),
    ];
    const snap = weeklySnapshot(rows, start);
    expect(snap.counts).toEqual({ open: 1, ready: 1, corrected: 1, signed_off: 1, reopened: 0 });
    expect(snap.openedThisWeek).toBe(1);
    expect(snap.closedThisWeek).toBe(1);
    expect(snap.open.map((r) => r.number)).toEqual([2, 3]);
  });
});

describe('header counts', () => {
  it('open includes ready and reopened; ready shows only when there is one', () => {
    const rows = [
      row({ number: 1, status: 'open' }),
      row({ number: 2, status: 'ready' }),
      row({ number: 3, status: 'reopened' }),
      row({ number: 4, status: 'signed_off' }),
      row({ number: 5, status: 'corrected' }),
    ];
    expect(logSummary(rows)).toBe('3 open · 1 ready');
    expect(logSummary([row({ number: 1 })])).toBe('1 open');
    expect(logSummary([])).toBe('0 open');
  });
});
