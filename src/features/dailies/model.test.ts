import { describe, expect, it } from 'vitest';
import { earlierDrafts, numberLabel, parseRecipients, reportChip, todayAction } from './model';

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
