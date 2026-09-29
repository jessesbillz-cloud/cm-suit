import { describe, expect, it } from 'vitest';
import { RFI_STATUSES, type RfiListRow, type RfiRow } from '../../data/rfis.types';
import { STATUS } from '../../lib/status';
import { fieldsOf, formOf, missingText } from './draft';
import {
  daysSince,
  daysText,
  defaultOrder,
  dueCell,
  dueLine,
  dueText,
  filterRows,
  impactKinds,
  impactWindow,
  logSummary,
  matches,
  moveAt,
  neighbors,
  nextSort,
  notOpened,
  openTarget,
  parseDays,
  parseFilter,
  parseSort,
  rfiLabel,
  rfiNumber,
  sortParam,
  statusChip,
  visibleRows,
  waitingText,
} from './model';

const TZ = 'America/Los_Angeles';
/** Monday Sep 28, 2026, noon in Los Angeles. */
const NOW = new Date('2026-09-28T19:00:00Z');

function row(p: Partial<RfiListRow> & { id: string }): RfiListRow {
  return {
    number: null,
    status: 'open',
    title: `Sample RFI ${p.id}`,
    created_by: 'u-sub',
    originator_name: 'Sample Sub',
    created_at: '2026-09-20T16:00:00Z',
    sent_at: '2026-09-20T17:00:00Z',
    issued_at: null,
    due_at: null,
    answered_at: null,
    closed_at: null,
    holder_label: 'Architect',
    held_since: '2026-09-21T16:00:00Z',
    held_opened_at: '2026-09-21T17:00:00Z',
    is_mine_to_act: false,
    impact_claimed_at: null,
    impact_until: null,
    version: 1,
    ...p,
  };
}

describe('labels and chips', () => {
  it('an RFI has a number only once issued', () => {
    expect(rfiLabel(null)).toBe('Draft');
    expect(rfiLabel(4)).toBe('RFI 004');
    expect(rfiLabel(1234)).toBe('RFI 1234');
    expect(rfiNumber(null)).toBe('Draft');
    expect(rfiNumber(12)).toBe('012');
  });

  it('every status has a chip whose color comes from lib/status', () => {
    for (const s of RFI_STATUSES) expect(Object.keys(STATUS)).toContain(statusChip(s).status);
    expect(statusChip('review').label).toBe('In review');
    expect(statusChip('issue').label).toBe('To issue');
    expect(statusChip('answered').status).toBe('confirmed');
  });
});

describe('time words', () => {
  it('how long someone has had it', () => {
    expect(daysSince('2026-09-28T10:00:00Z', NOW)).toBe(0);
    expect(daysSince('2026-09-23T18:00:00Z', NOW)).toBe(5);
    expect(daysSince('2026-09-29T10:00:00Z', NOW)).toBe(0);
    expect(daysText(0)).toBe('Since today');
    expect(daysText(1)).toBe('1 day');
    expect(daysText(5)).toBe('5 days');
  });

  it('due and late count calendar days in the job zone', () => {
    expect(dueText('2026-10-03T19:00:00Z', TZ, NOW)).toEqual({ text: 'Due Oct 3', late: false });
    expect(dueText('2026-09-28T23:00:00Z', TZ, NOW)).toEqual({ text: 'Due today', late: false });
    expect(dueText('2026-09-28T16:00:00Z', TZ, NOW)).toEqual({ text: 'Due today', late: true });
    expect(dueText('2026-09-27T19:00:00Z', TZ, NOW)).toEqual({ text: '1 day late', late: true });
    expect(dueText('2026-09-26T19:00:00Z', TZ, NOW)).toEqual({ text: '2 days late', late: true });
    // Sep 28 05:00 UTC is Sep 27, 10 PM in Los Angeles: a day late there.
    expect(dueText('2026-09-28T05:00:00Z', TZ, NOW)).toEqual({ text: '1 day late', late: true });
  });

  it('the log shows due words while the architect has it, the plain date after', () => {
    expect(dueCell(row({ id: 'a', due_at: '2026-10-03T19:00:00Z' }), TZ, NOW)).toEqual({ text: 'Oct 3', late: false });
    expect(dueCell(row({ id: 'a', due_at: '2026-09-26T19:00:00Z' }), TZ, NOW)).toEqual({ text: '2 days late', late: true });
    expect(dueCell(row({ id: 'a', due_at: '2026-09-28T23:00:00Z' }), TZ, NOW)).toEqual({ text: 'Today', late: false });
    expect(dueCell(row({ id: 'a', status: 'answered', due_at: '2026-09-26T19:00:00Z' }), TZ, NOW)).toEqual({ text: 'Sep 26', late: false });
    expect(dueCell(row({ id: 'a', due_at: null }), TZ, NOW)).toBeNull();
    expect(dueLine(row({ id: 'a', due_at: '2026-10-03T19:00:00Z' }), TZ, NOW)?.text).toBe('Due Oct 3');
    expect(dueLine(row({ id: 'a', status: 'closed', due_at: '2026-10-03T19:00:00Z' }), TZ, NOW)).toBeNull();
  });

  it('not opened only while someone holds it', () => {
    expect(notOpened({ status: 'open', held_opened_at: null })).toBe(true);
    expect(notOpened({ status: 'review', held_opened_at: null })).toBe(true);
    expect(notOpened({ status: 'open', held_opened_at: '2026-09-22T16:00:00Z' })).toBe(false);
    expect(notOpened({ status: 'answered', held_opened_at: null })).toBe(false);
    expect(notOpened({ status: 'draft', held_opened_at: null })).toBe(false);
  });

  it('says why an RFI waits at the top of Needs you', () => {
    expect(waitingText({ reason: 'late', due_at: '2026-09-26T19:00:00Z', held_since: '2026-09-19T16:00:00Z' }, TZ, NOW)).toBe('2 days late');
    expect(waitingText({ reason: 'unopened', due_at: null, held_since: '2026-09-23T18:00:00Z' }, TZ, NOW)).toBe('Not opened · 5 days');
  });

  it('the impact window counts days left on the job clock', () => {
    expect(impactWindow(null, TZ, NOW)).toBeNull();
    expect(impactWindow('2026-09-27T19:00:00Z', TZ, NOW)).toEqual({ open: false, text: 'Window closed' });
    expect(impactWindow('2026-09-28T23:00:00Z', TZ, NOW)).toEqual({ open: true, text: 'Last day' });
    expect(impactWindow('2026-09-29T19:00:00Z', TZ, NOW)).toEqual({ open: true, text: '1 day left' });
    expect(impactWindow('2026-10-02T19:00:00Z', TZ, NOW)).toEqual({ open: true, text: '4 days left' });
    expect(impactKinds(true, true)).toBe('Cost and time');
    expect(impactKinds(true, null)).toBe('Cost');
    expect(impactKinds(false, true)).toBe('Time');
    expect(impactKinds(null, null)).toBe('');
  });
});

describe('the log', () => {
  const rows = [
    row({ id: 'closed', number: 1, status: 'closed', created_at: '2026-09-01T16:00:00Z' }),
    row({ id: 'late', number: 3, due_at: '2026-09-26T19:00:00Z', created_at: '2026-09-10T16:00:00Z' }),
    row({ id: 'later', number: 4, due_at: '2026-10-05T19:00:00Z', created_at: '2026-09-12T16:00:00Z' }),
    row({ id: 'soon', number: 5, due_at: '2026-09-30T19:00:00Z', created_at: '2026-09-11T16:00:00Z' }),
    row({ id: 'mine', status: 'issue', is_mine_to_act: true, created_at: '2026-09-02T16:00:00Z' }),
    row({ id: 'newest', status: 'review', created_at: '2026-09-27T16:00:00Z' }),
    row({ id: 'draft', status: 'draft', created_by: 'u-me', is_mine_to_act: false, created_at: '2026-09-25T16:00:00Z' }),
    row({ id: 'void', number: 2, status: 'void' }),
  ];
  const ids = (list: readonly RfiListRow[]) => list.map((r) => r.id);

  it('filters: Open (the default) hides closed and void; Mine is mine to act or my own', () => {
    expect(parseFilter(undefined)).toBe('open');
    expect(parseFilter('nope')).toBe('open');
    expect(parseFilter('all')).toBe('all');
    expect(ids(filterRows(rows, 'open', 'u-me'))).not.toContain('closed');
    expect(ids(filterRows(rows, 'open', 'u-me'))).not.toContain('void');
    expect(ids(filterRows(rows, 'mine', 'u-me'))).toEqual(['mine', 'draft']);
    expect(filterRows(rows, 'all', 'u-me')).toHaveLength(rows.length);
  });

  it('default order: mine to act, then late, then due soonest, then newest', () => {
    expect(ids(defaultOrder(rows, NOW))).toEqual(['mine', 'late', 'soon', 'later', 'newest', 'draft', 'void', 'closed']);
  });

  it('a header click sorts ascending, then descending, then back to the default order', () => {
    expect(parseSort(undefined)).toBeNull();
    expect(parseSort('due.desc')).toEqual({ key: 'due', dir: 'desc' });
    expect(parseSort('bogus.asc')).toBeNull();
    expect(nextSort(null, 'number')).toEqual({ key: 'number', dir: 'asc' });
    expect(nextSort({ key: 'number', dir: 'asc' }, 'number')).toEqual({ key: 'number', dir: 'desc' });
    expect(nextSort({ key: 'number', dir: 'desc' }, 'number')).toBeNull();
    expect(nextSort({ key: 'number', dir: 'desc' }, 'title')).toEqual({ key: 'title', dir: 'asc' });
    expect(sortParam(null)).toBeUndefined();
    expect(sortParam({ key: 'asked', dir: 'asc' })).toBe('asked.asc');
  });

  it('sorting by number keeps unnumbered RFIs last either way', () => {
    const view = { filter: 'all' as const, query: '', userId: 'u-me' };
    const up = ids(visibleRows(rows, { ...view, sort: { key: 'number', dir: 'asc' } }, NOW));
    const down = ids(visibleRows(rows, { ...view, sort: { key: 'number', dir: 'desc' } }, NOW));
    expect(up.slice(0, 5)).toEqual(['closed', 'void', 'late', 'later', 'soon']);
    expect(down.slice(0, 5)).toEqual(['soon', 'later', 'late', 'void', 'closed']);
    expect(up.slice(5).sort()).toEqual(['draft', 'mine', 'newest']);
  });

  it('one search box: a number in any form, the title or who asked', () => {
    const r = row({ id: 'x', number: 4, title: 'Sample door hardware at stair 2', originator_name: 'Sample Sub' });
    for (const q of ['4', '004', '#4', 'RFI 4', 'rfi-004', 'RFI 004']) expect(matches(r, q)).toBe(true);
    expect(matches(r, 'hardware')).toBe(true);
    expect(matches(r, 'sample sub')).toBe(true);
    expect(matches(r, '5')).toBe(false);
    expect(matches(r, '')).toBe(true);
  });

  it('Enter opens that number even when the filter hides it, else the only match', () => {
    const open = filterRows(rows, 'open', 'u-me');
    expect(openTarget(rows, open, 'RFI 1')?.id).toBe('closed');
    expect(openTarget(rows, [row({ id: 'only' })], 'sample')?.id).toBe('only');
    expect(openTarget(rows, open, 'sample')).toBeUndefined();
  });

  it('the header counts what is open and what is late', () => {
    // Open: everything but closed and void (drafts too); late: only 'late' (due Sep 26, still with the architect).
    expect(logSummary(rows, TZ, NOW)).toBe('6 open · 1 late');
    expect(logSummary([row({ id: 'a', due_at: '2026-10-05T19:00:00Z' })], TZ, NOW)).toBe('1 open');
    expect(logSummary([], TZ, NOW)).toBe('0 open');
  });

  it('arrow keys walk the order shown', () => {
    const shown = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    expect(neighbors(shown, 'b')).toEqual({ prev: 'a', next: 'c' });
    expect(neighbors(shown, 'a')).toEqual({ prev: null, next: 'b' });
    expect(neighbors(shown, 'zzz')).toEqual({ prev: null, next: null });
  });
});

describe('job settings', () => {
  it('moves a route step up or down, never past the ends', () => {
    expect(moveAt(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveAt(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveAt(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveAt(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('days are whole numbers from 1 to 60', () => {
    expect(parseDays('7')).toBe(7);
    expect(parseDays(' 12 ')).toBe(12);
    expect(parseDays('60')).toBe(60);
    for (const bad of ['0', '61', '2.5', '', 'seven', '-3']) expect(parseDays(bad)).toBeNull();
  });
});

describe('the RFI form', () => {
  const saved: RfiRow = {
    id: 'rfi-1', org_id: 'org', project_id: 'job', number: null, status: 'review', title: 'Sample title', question: 'Sample question?',
    suggestion: 'Sample idea', refs: 'Sample A-101', photo_ids: ['p1', 'p2'], cost_impact: true, time_impact: false, needed_by: '2026-10-01',
    step: 1, due_at: null, held_since: null, held_opened_at: null, sent_at: null, issued_at: null, answer: null, answer_file_ids: [],
    answered_at: null, impact_until: null, impact_claimed_at: null, impact_cost: null, impact_time: null, impact_note: null,
    impact_gc_note: null, closed_at: null, void_note: null, pdf_file_id: null, created_by: 'u-sub', created_at: '2026-09-20T16:00:00Z', version: 3,
  };

  it('starts empty for a new RFI and from the saved one otherwise', () => {
    expect(formOf(null)).toEqual({ title: '', question: '', suggestion: '', refs: '', neededBy: '', cost: false, time: false, kept: [] });
    expect(formOf(saved)).toEqual({
      title: 'Sample title', question: 'Sample question?', suggestion: 'Sample idea', refs: 'Sample A-101', neededBy: '2026-10-01',
      cost: true, time: false, kept: ['p1', 'p2'],
    });
  });

  it('a save trims, keeps photos then adds new ones, and sends unchecked impact as not stated', () => {
    const form = { ...formOf(saved), title: '  Sample title  ', neededBy: '', cost: false, kept: ['p2'] };
    expect(fieldsOf(form, ['p2', 'p3'])).toEqual({
      title: 'Sample title', question: 'Sample question?', photoIds: ['p2', 'p3'], suggestion: 'Sample idea', refs: 'Sample A-101',
      neededBy: null, costImpact: null, timeImpact: null,
    });
  });

  it('only the title and the question are required', () => {
    expect(missingText({ title: '', question: '' })).toBe('Add a title and a question.');
    expect(missingText({ title: '', question: 'Q' })).toBe('Add a title.');
    expect(missingText({ title: 'T', question: '' })).toBe('Add the question.');
    expect(missingText({ title: 'T', question: 'Q' })).toBeNull();
  });
});
