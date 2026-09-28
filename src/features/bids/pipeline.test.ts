import { describe, expect, it } from 'vitest';
import type { PipelineRow } from '../../data/bids.pipeline';
import {
  dueDate,
  dueRelative,
  nextSort,
  parseSort,
  parseStages,
  shownRows,
  sortParam,
  sortPipeline,
  stageChip,
  stageCounts,
  stagesParam,
  toggleStage,
} from './pipeline';

const TZ = 'America/Los_Angeles';

function row(id: string, stage: string, due: string | null, extra: Partial<PipelineRow> = {}): PipelineRow {
  return {
    project_id: id,
    name: `Sample ${id}`,
    number: null,
    org_name: 'Sample Builders',
    stage,
    timezone: TZ,
    bid_due_at: due,
    packages: 0,
    packages_covered: 0,
    bids_in: 0,
    invited: 0,
    open_questions: 0,
    ...extra,
  };
}

const ids = (rows: readonly PipelineRow[]) => rows.map((r) => r.project_id);

describe('pipeline stages (the funnel)', () => {
  it('shows the open bids by default and keeps the URL clean for them', () => {
    expect(parseStages(undefined)).toEqual(['prospect', 'bidding']);
    expect(parseStages('junk')).toEqual(['prospect', 'bidding']);
    expect(parseStages('lost,awarded')).toEqual(['awarded', 'lost']);
    expect(stagesParam(['bidding', 'prospect'])).toBeUndefined();
    expect(stagesParam(['prospect', 'bidding', 'awarded'])).toBe('prospect,bidding,awarded');
  });
  it('toggles a stage in funnel order and never turns off the last one', () => {
    expect(toggleStage(['prospect', 'bidding'], 'lost')).toEqual(['prospect', 'bidding', 'lost']);
    expect(toggleStage(['bidding', 'lost'], 'prospect')).toEqual(['prospect', 'bidding', 'lost']);
    expect(toggleStage(['prospect', 'bidding'], 'prospect')).toEqual(['bidding']);
    expect(toggleStage(['bidding'], 'bidding')).toEqual(['bidding']);
  });
  it('counts jobs per stage and maps stages to lib/status chips', () => {
    const rows = [row('a', 'bidding', null), row('b', 'bidding', null), row('c', 'lost', null)];
    expect(stageCounts(rows)).toEqual({ prospect: 0, bidding: 2, awarded: 0, lost: 1 });
    expect(stageChip('prospect')).toEqual({ status: 'pending', label: 'Prospect' });
    expect(stageChip('bidding')).toEqual({ status: 'assigned', label: 'Bidding' });
    expect(stageChip('awarded')).toEqual({ status: 'confirmed', label: 'Awarded' });
    expect(stageChip('lost')).toEqual({ status: 'cancelled', label: 'Lost' });
  });
});

describe('pipeline sort', () => {
  const rows = [
    row('awarded-early', 'awarded', '2026-09-01T21:00:00Z'),
    row('no-date', 'prospect', null),
    row('later', 'bidding', '2026-10-20T21:00:00Z', { open_questions: 5, bids_in: 2, packages: 4, packages_covered: 4 }),
    row('soon', 'bidding', '2026-10-02T21:00:00Z', { open_questions: 1, bids_in: 9, packages: 4, packages_covered: 1 }),
  ];

  it('default: open bids first, bid due soonest, no date last', () => {
    expect(ids(sortPipeline(rows, parseSort(undefined)))).toEqual(['soon', 'later', 'no-date', 'awarded-early']);
  });
  it('re-sorts by a column; empty values stay last either way', () => {
    expect(ids(sortPipeline(rows, { key: 'questions', dir: 'desc' }))).toEqual(['later', 'soon', 'awarded-early', 'no-date']);
    expect(ids(sortPipeline(rows, { key: 'packages', dir: 'asc' }))).toEqual(['soon', 'later', 'awarded-early', 'no-date']);
    expect(ids(sortPipeline(rows, { key: 'packages', dir: 'desc' }))).toEqual(['later', 'soon', 'awarded-early', 'no-date']);
    expect(ids(sortPipeline(rows, { key: 'stage', dir: 'asc' }))).toEqual(['no-date', 'soon', 'later', 'awarded-early']);
    expect(ids(sortPipeline(rows, { key: 'job', dir: 'desc' }))).toEqual(['soon', 'no-date', 'later', 'awarded-early']);
  });
  it('shows only the stages picked', () => {
    expect(ids(shownRows(rows, ['prospect', 'bidding'], parseSort(undefined)))).toEqual(['soon', 'later', 'no-date']);
    expect(ids(shownRows(rows, ['awarded'], parseSort(undefined)))).toEqual(['awarded-early']);
  });
  it('a header click flips the same column and starts a new one where it helps most', () => {
    expect(nextSort({ key: 'due', dir: 'asc' }, 'due')).toEqual({ key: 'due', dir: 'desc' });
    expect(nextSort({ key: 'due', dir: 'asc' }, 'questions')).toEqual({ key: 'questions', dir: 'desc' });
    expect(nextSort({ key: 'due', dir: 'asc' }, 'job')).toEqual({ key: 'job', dir: 'asc' });
    expect(sortParam({ key: 'due', dir: 'asc' })).toBeUndefined();
    expect(parseSort(sortParam({ key: 'bids', dir: 'desc' }))).toEqual({ key: 'bids', dir: 'desc' });
    expect(parseSort('nonsense.up')).toEqual({ key: 'due', dir: 'asc' });
  });
});

describe('bid due', () => {
  // 10:00 on Sep 28 in Los Angeles.
  const now = new Date('2026-09-28T17:00:00Z');

  it('says today, tomorrow or in N days by the job\'s calendar, and past once bid time has gone by', () => {
    expect(dueRelative('2026-09-28T21:00:00Z', TZ, now)).toBe('today');
    expect(dueRelative('2026-09-29T06:30:00Z', TZ, now)).toBe('today'); // 11:30 PM on the 28th, job time
    expect(dueRelative('2026-09-29T21:00:00Z', TZ, now)).toBe('tomorrow');
    expect(dueRelative('2026-10-01T21:00:00Z', TZ, now)).toBe('in 3 days');
    expect(dueRelative('2026-09-28T16:00:00Z', TZ, now)).toBe('past');
    expect(dueRelative('2026-09-20T21:00:00Z', TZ, now)).toBe('past');
  });
  it('shows the date and time in the job\'s zone', () => {
    expect(dueDate('2026-10-01T21:00:00Z', TZ)).toBe('Oct 1, 2:00 PM');
    expect(dueDate('2026-10-01T21:00:00Z', 'America/New_York')).toBe('Oct 1, 5:00 PM');
  });
});
