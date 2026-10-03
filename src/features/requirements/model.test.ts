import { describe, expect, it } from 'vitest';
import type { Requirement } from '../../data/requirements.types';
import {
  draftRows,
  dueRows,
  dueWords,
  groupRows,
  headerCounts,
  parseGrouping,
  parseView,
  readPages,
  readWords,
  rowFacts,
  triggerWords,
  viewsFor,
} from './model';

function req(over: Partial<Requirement>): Requirement {
  return {
    id: 'r', version: 1, kind: 'other', title: 'Sample', details: '', spec_section: '', spec_title: '', spec_ref: '', responsible: '',
    required: 'yes', notice_days: null, lead_days: null, activity_code: '', activity_name: '', trigger_date: null, due_on: null,
    days_left: null, status: 'open', status_at: null, evidence_note: '', evidence_file_id: null, evidence_file_name: null, origin: 'hand',
    draft: false, source_file_id: null, source_file_name: null, source_page: null, source_quote: '', created_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('requirements views', () => {
  it('Due | All for readers; Drafts (with the count) for managers', () => {
    expect(viewsFor(false, 3).map((v) => v.label)).toEqual(['Due', 'All']);
    expect(viewsFor(true, 3).map((v) => v.label)).toEqual(['Due', 'All', 'Drafts 3']);
    expect(viewsFor(true, 0).map((v) => v.label)).toEqual(['Due', 'All', 'Drafts']);
    expect(parseView('drafts')).toBe('drafts');
    expect(parseView('nonsense')).toBe('due');
    expect(parseGrouping('section')).toBe('section');
    expect(parseGrouping(undefined)).toBe('kind');
  });

  it('Due: kept, still to do, late or within 60 days', () => {
    const rows = [
      req({ id: 'late', due_on: '2026-09-30', days_left: -3 }),
      req({ id: 'soon', due_on: '2026-10-10', days_left: 7, status: 'requested' }),
      req({ id: 'edge', due_on: '2026-12-02', days_left: 60, status: 'scheduled' }),
      req({ id: 'far', due_on: '2026-12-03', days_left: 61 }),
      req({ id: 'done', due_on: '2026-10-05', days_left: 2, status: 'done' }),
      req({ id: 'na', due_on: '2026-10-05', days_left: 2, status: 'na' }),
      req({ id: 'undated' }),
      req({ id: 'draft', due_on: '2026-10-05', days_left: 2, draft: true }),
    ];
    expect(dueRows(rows).map((r) => r.id)).toEqual(['late', 'soon', 'edge']);
    expect(headerCounts(rows)).toEqual({ late: 1, soon: 2 });
  });

  it('Drafts: in the book\'s order', () => {
    const rows = [
      req({ id: 'b', draft: true, spec_section: '28 46 21.11', source_page: 2 }),
      req({ id: 'a2', draft: true, spec_section: '10 28 00', source_page: 5 }),
      req({ id: 'a1', draft: true, spec_section: '10 28 00', source_page: 3 }),
      req({ id: 'kept', spec_section: '01 10 00' }),
    ];
    expect(draftRows(rows).map((r) => r.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('All: by kind in the kinds\' order, or by section by number with none last', () => {
    const rows = [
      req({ id: '1', kind: 'warranty', spec_section: '07 54 23', spec_title: 'Roofing' }),
      req({ id: '2', kind: 'ofci', spec_section: '10 28 00', spec_title: 'Toilet Accessories' }),
      req({ id: '3', kind: 'warranty', spec_section: '' }),
    ];
    expect(groupRows(rows, 'kind').map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Owner furnished, contractor installed', ['2']],
      ['Special warranty', ['1', '3']],
    ]);
    expect(groupRows(rows, 'section').map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['07 54 23 Roofing', ['1']],
      ['10 28 00 Toilet Accessories', ['2']],
      ['No section', ['3']],
    ]);
  });

  it('due words from the database\'s days left', () => {
    expect(dueWords(req({ due_on: '2026-11-02', days_left: 30 }))).toEqual({ text: 'Due Nov 2', late: false });
    expect(dueWords(req({ due_on: '2026-10-03', days_left: 0 }))).toEqual({ text: 'Due today', late: true });
    expect(dueWords(req({ due_on: '2026-10-01', days_left: -2 }))).toEqual({ text: 'Late · Oct 1', late: true });
    expect(dueWords(req({}))).toBeNull();
    expect(dueWords(req({ due_on: '2026-10-01', days_left: -2, status: 'done' }))).toEqual({ text: 'Due Oct 1', late: false });
    expect(dueWords(req({ due_on: '2026-10-01', days_left: -2, status: 'scheduled' }))).toEqual({ text: 'Late · Oct 1', late: true });
  });

  it('after a read: what was added, what the job had, what had no quote', () => {
    expect(readWords({ found: 0, added: 0, skipped: 0, unquoted: 0 })).toBe('Nothing found in that section.');
    expect(readWords({ found: 3, added: 2, skipped: 1, unquoted: 0 })).toBe('2 drafts · 1 already here');
    expect(readWords({ found: 2, added: 1, skipped: 0, unquoted: 1 })).toBe('1 draft · 1 without a quote');
    expect(readPages(402, 406)).toEqual({ first: 402, last: 406 });
    expect(readPages(10, 90)).toEqual({ first: 10, last: 49 });
  });

  it('facts and the trigger in words', () => {
    expect(rowFacts(req({ responsible: 'Owner', spec_section: '10 28 00', spec_ref: '1.3.A' }))).toBe('Owner · 10 28 00 ¶1.3.A');
    expect(rowFacts(req({ spec_section: '10 28 00' }))).toBe('10 28 00');
    expect(triggerWords(req({ notice_days: 60, activity_name: 'Restroom finishes start', trigger_date: '2026-12-02' }))).toBe(
      '60 days before Restroom finishes start (Dec 2)',
    );
    expect(triggerWords(req({ notice_days: 10, lead_days: 4, activity_name: 'Acceptance test' }))).toBe('14 days before Acceptance test');
    expect(triggerWords(req({ trigger_date: '2027-03-01' }))).toBe('Mar 1');
    expect(triggerWords(req({ notice_days: 14, trigger_date: '2027-03-01' }))).toBe('14 days before Mar 1');
    expect(triggerWords(req({ notice_days: 14 }))).toBe('14 days before the trigger');
    expect(triggerWords(req({ activity_name: 'Substantial completion' }))).toBe('Substantial completion');
    expect(triggerWords(req({}))).toBeNull();
  });
});
