import { describe, expect, it } from 'vitest';
import { earlierDrafts, numberLabel, parseRecipients, pdfOffer, reportChip, todayAction, todayChip, todayMeta } from './model';

describe('todayMeta', () => {
  it('says the number and due time, or that today is in', () => {
    expect(todayMeta({ todays: null, next: 12, due: '5:00 PM' })).toBe('Report #12 · due 5:00 PM');
    expect(todayMeta({ todays: { status: 'draft', number: null, version: 3, signed_version: null }, next: 12, due: null })).toBe('Report #12');
    expect(todayMeta({ todays: null, next: undefined, due: '5:00 PM' })).toBe('Due 5:00 PM');
    expect(todayMeta({ todays: null, next: undefined, due: null })).toBeNull();
    expect(todayMeta({ todays: { status: 'submitted', number: 11, version: 4, signed_version: 4 }, next: 12, due: '5:00 PM' })).toBe(
      'Submitted today',
    );
    expect(todayMeta({ todays: { status: 'submitted', number: 11, version: 5, signed_version: 4 }, next: 12, due: null })).toBe(
      'Report #11 · changed',
    );
  });
});

describe('todayAction', () => {
  it('reads Start, Continue or Edit submitted', () => {
    expect(todayAction(null)).toBe('start');
    expect(todayAction({ status: 'draft', version: 1 })).toBe('start');
    expect(todayAction({ status: 'draft', version: 3 })).toBe('continue');
    expect(todayAction({ status: 'submitted', version: 9 })).toBe('edit');
  });
});

describe('earlierDrafts', () => {
  it('lists earlier days not yet submitted, oldest first', () => {
    const rows = [
      { status: 'draft', report_date: '2026-09-28' },
      { status: 'draft', report_date: '2026-09-25' },
      { status: 'submitted', report_date: '2026-09-24' },
      { status: 'draft', report_date: '2026-09-23' },
    ];
    expect(earlierDrafts(rows, '2026-09-28').map((r) => r.report_date)).toEqual(['2026-09-23', '2026-09-25']);
  });
});

describe('numberLabel', () => {
  it('shows the number, or what it will be', () => {
    expect(numberLabel(12, 13)).toBe('#12');
    expect(numberLabel(null, 13)).toBe('will be #13');
    expect(numberLabel(null, undefined)).toBe('');
  });
});

describe('reportChip', () => {
  it('draft, submitted, or changed since signed', () => {
    expect(reportChip({ status: 'draft', version: 2, signed_version: null }).label).toBe('Draft');
    expect(reportChip({ status: 'submitted', version: 4, signed_version: 4 }).label).toBe('Submitted');
    expect(reportChip({ status: 'submitted', version: 5, signed_version: 4 }).label).toBe('Changed');
  });
});

describe('todayChip', () => {
  it('Not started (yellow) until there is work in it, then the report chip', () => {
    expect(todayChip(null)).toEqual({ status: 'pending', label: 'Not started' });
    expect(todayChip({ status: 'draft', version: 1, signed_version: null })).toEqual({ status: 'pending', label: 'Not started' });
    expect(todayChip({ status: 'draft', version: 2, signed_version: null }).label).toBe('Draft');
    expect(todayChip({ status: 'submitted', version: 5, signed_version: 4 }).label).toBe('Changed');
  });
});

describe('pdfOffer', () => {
  it('never offers a changed report\'s PDF as current', () => {
    const r = { status: 'submitted', version: 4, signed_version: 4, pdf_file_id: 'f' };
    expect(pdfOffer(r, true)).toBe('current');
    expect(pdfOffer({ ...r, version: 5 }, true)).toBe('resubmit');
    expect(pdfOffer({ ...r, version: 5 }, false)).toBe('signed');
    expect(pdfOffer({ ...r, pdf_file_id: null }, false)).toBe('none');
    expect(pdfOffer({ ...r, status: 'draft' }, true)).toBe('none');
  });
});

describe('parseRecipients', () => {
  it('takes addresses however they were typed, once each', () => {
    expect(parseRecipients('A@Example.test, b@example.test\nc@example.test; a@example.test  ')).toEqual([
      'a@example.test',
      'b@example.test',
      'c@example.test',
    ]);
    expect(parseRecipients('  ')).toEqual([]);
  });
});
