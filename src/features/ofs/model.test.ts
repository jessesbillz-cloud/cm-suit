import { describe, expect, it } from 'vitest';
import type { DeskRow, OfsReviewRow } from '../../data/ofs.types';
import { deskLists, deskTitle, reviewTree, rfiNo, rowTitle, sectionLabel } from './model';

function row(p: Partial<OfsReviewRow> & Pick<OfsReviewRow, 'id' | 'kind' | 'title'>): OfsReviewRow {
  return {
    project_id: 'job', rfi_id: null, file_id: null, number: null, section: null, sent_at: '2026-10-22T16:00:00Z', decision: null,
    decided_at: null, version: 1, ...p,
  };
}

const ROWS: OfsReviewRow[] = [
  row({ id: 's1', kind: 'submittal', title: '283100_02.0_Sample Alarm Devices.pdf', section: '283100' }),
  row({ id: 's2', kind: 'submittal', title: '211313_10.0_Sample Heads.pdf', section: '211313' }),
  row({ id: 's3', kind: 'submittal', title: '211313_02.0_Sample Pipe.pdf', section: '211313' }),
  row({ id: 's4', kind: 'submittal', title: 'Sample loose sheet.pdf' }),
  row({ id: 'r1', kind: 'rfi', title: 'Sample head spacing', number: 14 }),
  row({ id: 'd1', kind: 'rfi_document', title: 'RFI 003 Sample response.pdf' }),
  row({ id: 'd2', kind: 'rfi_document', title: 'Sample answer without a number.pdf' }),
  row({ id: 's5', kind: 'submittal', title: '078100_01.0_Sample Fireproofing.pdf', section: '078100', decision: 'approved' }),
  row({ id: 'r2', kind: 'rfi', title: 'Sample damper access', number: 2, decision: 'not_approved' }),
];

describe('the fire marshal\'s groups', () => {
  it('Waiting: submittals by spec section (no section last), each section by name; RFIs by number', () => {
    const t = reviewTree(ROWS);
    expect(t.waiting.count).toBe(7);
    expect(t.waiting.submittals.map((g) => g.label)).toEqual(['21 13 13', '28 31 00', 'No section']);
    expect(t.waiting.submittals[0]?.rows.map((r) => r.id)).toEqual(['s3', 's2']);
    expect(t.waiting.rfis.map((r) => r.id)).toEqual(['d1', 'r1', 'd2']);
  });
  it('Done: Approved and Not approved, the same grouping', () => {
    const t = reviewTree(ROWS);
    expect(t.approved.submittals.map((g) => g.label)).toEqual(['07 81 00']);
    expect(t.approved.count).toBe(1);
    expect(t.notApproved.rfis.map((r) => r.id)).toEqual(['r2']);
  });
  it('labels', () => {
    expect(sectionLabel('211313')).toBe('21 13 13');
    expect(sectionLabel(null)).toBe('No section');
    expect(rfiNo({ number: null, title: 'RFI #012 - Sample.pdf' })).toBe(12);
    expect(rfiNo({ number: null, title: 'Sample.pdf' })).toBeNull();
    expect(rowTitle({ kind: 'rfi', number: 4, title: 'Sample' })).toBe('RFI 004 · Sample');
    expect(rowTitle({ kind: 'rfi_document', number: null, title: 'RFI 4.pdf' })).toBe('RFI 4.pdf');
  });
});

function desk(p: Partial<DeskRow> & Pick<DeskRow, 'id' | 'kind' | 'state'>): DeskRow {
  return { target_type: 'file', target_id: p.id, number: null, title: `Sample ${p.id}`, at: '2026-10-22T16:00:00Z', sched: null, ...p };
}

describe("the designated person's lists", () => {
  it('Waiting on OFS by kind, Back from OFS by outcome, empty groups left out', () => {
    const l = deskLists([
      desk({ id: 'a', kind: 'submittal', state: 'waiting' }),
      desk({ id: 'b', kind: 'rfi_document', state: 'waiting' }),
      desk({ id: 'c', kind: 'rfi', state: 'approved' }),
      desk({ id: 'd', kind: 'inspection', state: 'failed', number: 31 }),
      desk({ id: 'e', kind: 'inspection', state: 'waiting' }),
    ]);
    expect(l.waiting.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Submittals', ['a']],
      ['RFIs', ['b']],
      ['Inspections', ['e']],
    ]);
    expect(l.back.map((g) => g.label)).toEqual(['Approved', 'Failed']);
    expect(deskTitle(desk({ id: 'd', kind: 'inspection', state: 'failed', number: 31, title: 'Level 2 walls' }))).toBe('OFS 31 · Level 2 walls');
  });
});
