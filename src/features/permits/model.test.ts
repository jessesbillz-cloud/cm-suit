import { describe, expect, it } from 'vitest';
import type { PermitListRow, PermitStep } from '../../data/permits.types';
import {
  approvedFolder,
  byNumber,
  expiry,
  inFilter,
  kindLabel,
  logSummary,
  moveLabel,
  movedLabel,
  outcomeLabel,
  parseFilter,
  splitNumbers,
  stageCode,
  stageLabel,
  stepCell,
  stepsByPermit,
} from './model';

const TZ = 'America/Los_Angeles';

function row(primary_number: string, project_name = 'Sample Job', stage = 'draft'): PermitListRow {
  return {
    id: `${primary_number}-${project_name}`, project_id: 'job', project_name, timezone: TZ, primary_number, agency_numbers: [],
    title: 'Sample', kind: 'building', stage, stage_since: '2026-09-01T16:00:00Z', assigned_to: null, assigned_name: null,
    issued_on: null, expires_on: null, extensions: 0, open_comments: 0, review_cycle: 0, version: 1,
  };
}

function step(position: number, stage: string, state: PermitStep['state'], days: number | null, entered: string | null = null, left: string | null = null): PermitStep {
  return { permit_id: 'p', position, stage, state, entered_at: entered, left_at: left, days };
}

describe('permit words', () => {
  it("names each stage, with OSFM's code where it has one", () => {
    expect(stageLabel('comments_out')).toBe('Comments out');
    expect(stageCode('comments_out')).toBe('PR');
    expect(stageCode('issued')).toBe('PI');
    expect(stageCode('backcheck')).toBeNull();
    expect(stageCode('inspections')).toBeNull();
    expect(stageLabel('something_new')).toBe('something_new');
    expect(kindLabel('deferred_errcs')).toBe('Radio coverage (deferred)');
    expect(outcomeLabel('revise_resubmit')).toBe('Revise and resubmit');
  });
  it('move buttons: reject and cancel by name, everything else "Move to"', () => {
    expect(moveLabel('rejected')).toBe('Reject');
    expect(moveLabel('cancelled')).toBe('Cancel permit');
    expect(moveLabel('in_review')).toBe('Move to In review');
    expect(movedLabel('accepted')).toBe('Moved to Accepted.');
    expect(movedLabel('cancelled')).toBe('Permit cancelled.');
  });
});

describe('the log', () => {
  it('Open: not complete or cancelled; Issued: issued through approved; All: everything', () => {
    expect(['draft', 'rejected', 'backcheck', 'inspections'].every((s) => inFilter(s, 'open'))).toBe(true);
    expect(inFilter('complete', 'open') || inFilter('cancelled', 'open')).toBe(false);
    expect(['issued', 'inspections', 'approved'].every((s) => inFilter(s, 'issued'))).toBe(true);
    expect(inFilter('in_review', 'issued') || inFilter('complete', 'issued')).toBe(false);
    expect(inFilter('cancelled', 'all')).toBe(true);
    expect(parseFilter(undefined)).toBe('open');
    expect(parseFilter('issued')).toBe('issued');
    expect(parseFilter('nonsense')).toBe('open');
  });
  it('sorts by permit number (numbers inside as numbers), then job', () => {
    const rows = [row('24-0010'), row('24-0002', 'B job'), row('23-0410'), row('24-0002', 'A job')];
    expect([...rows].sort(byNumber).map((r) => `${r.primary_number} ${r.project_name}`)).toEqual([
      '23-0410 Sample Job',
      '24-0002 A job',
      '24-0002 B job',
      '24-0010 Sample Job',
    ]);
  });
  it('one line of counts', () => {
    expect(logSummary([row('1', 'x', 'draft'), row('2', 'x', 'issued'), row('3', 'x', 'complete')])).toBe('2 open · 1 issued');
  });
  it("groups each permit's places, in order", () => {
    const by = stepsByPermit([step(2, 'submitted', 'current', 0), { ...step(1, 'draft', 'done', 1), permit_id: 'q' }, step(1, 'draft', 'done', 3)]);
    expect(by.get('p')?.map((s) => s.position)).toEqual([1, 2]);
    expect(by.get('q')?.length).toBe(1);
  });
});

describe('the tracker cells', () => {
  it('a stage, the days it sat there (one way everywhere: "<1d", "5d"), and the Stepper state', () => {
    expect(stepCell(step(4, 'in_review', 'current', 5, '2026-09-20T16:00:00Z'), TZ, true)).toEqual({
      key: '4', kind: 'in_review', label: 'In review', sub: '5d', state: 'current', title: 'In review · since Sep 20',
    });
    expect(stepCell(step(1, 'draft', 'done', 0, '2026-09-01T16:00:00Z', '2026-09-01T20:00:00Z'), TZ, true)).toEqual({
      key: '1', kind: 'draft', label: 'Draft', sub: '<1d', state: 'done', title: 'Draft · Sep 1 to Sep 1',
    });
    expect(stepCell(step(5, 'comments_out', 'next', null), TZ, true)).toEqual({
      key: '5', kind: 'comments_out', label: 'Comments out', sub: '', state: 'todo', title: 'Comments out',
    });
    expect(stepCell(step(3, 'rejected', 'failed', 2, '2026-09-03T16:00:00Z'), TZ, true).state).toBe('failed');
    expect(stepCell(step(3, 'rejected', 'failed', 2, '2026-09-03T16:00:00Z'), TZ, true).label).toBe('Rejected');
  });
  it('dots only (a phone log row): no names, the days stay', () => {
    const cell = stepCell(step(4, 'in_review', 'current', 5), TZ, false);
    expect([cell.label, cell.sub]).toEqual(['', '5d']);
  });
});

describe('the permit page', () => {
  it('expiry: only while issued and building; late once the day has passed on the job clock', () => {
    const now = new Date('2026-10-01T18:00:00Z');
    expect(expiry({ expires_on: '2027-06-03', stage: 'draft' }, TZ, now)).toBeNull();
    expect(expiry({ expires_on: null, stage: 'issued' }, TZ, now)).toBeNull();
    expect(expiry({ expires_on: '2027-06-03', stage: 'complete' }, TZ, now)).toBeNull();
    expect(expiry({ expires_on: '2027-06-03', stage: 'inspections' }, TZ, now)).toEqual({ date: 'Jun 3, 2027', late: false });
    expect(expiry({ expires_on: '2026-09-30', stage: 'issued' }, TZ, now)).toEqual({ date: 'Sep 30, 2026', late: true });
    // Late on Oct 1 in Los Angeles, not yet at 6 PM there on Sep 30 (01:00 UTC on Oct 1).
    expect(expiry({ expires_on: '2026-09-30', stage: 'issued' }, TZ, new Date('2026-10-01T01:00:00Z'))?.late).toBe(false);
  });
  it('the approved set: the job folder named for approved plans or permits', () => {
    expect(approvedFolder([{ name: 'Plans' }, { name: 'Approved plans' }])?.name).toBe('Approved plans');
    expect(approvedFolder([{ name: 'OSFM permits' }])?.name).toBe('OSFM permits');
    expect(approvedFolder([{ name: 'Plans' }, { name: 'Specs' }])).toBeNull();
  });
  it('other numbers typed in one box', () => {
    expect(splitNumbers(' 25-0002, 24-0772 ;; 25-5343 ')).toEqual(['25-0002', '24-0772', '25-5343']);
    expect(splitNumbers('')).toEqual([]);
  });
});
