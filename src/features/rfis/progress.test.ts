import { describe, expect, it } from 'vitest';
import type { RfiProgressRow } from '../../data/rfis.types';
import { rowNumber } from './model';
import { cellText, cellTitle, daysLabel, dueMark, pdfWait, stripsByRfi } from './progress';

const TZ = 'America/Los_Angeles';
/** Monday Sep 28, 2026, noon in Los Angeles. */
const NOW = new Date('2026-09-28T19:00:00Z');

function step(p: Partial<RfiProgressRow> & { position: number }): RfiProgressRow {
  return {
    rfi_id: 'r1',
    kind: 'review',
    label: 'Inspector',
    person_name: null,
    state: 'next',
    entered_at: null,
    left_at: null,
    days: null,
    due_at: null,
    ...p,
  };
}

describe('the route strip', () => {
  it('says how long in whole days, one way everywhere', () => {
    expect(daysLabel(null)).toBe('');
    expect(daysLabel(0)).toBe('<1d');
    expect(daysLabel(1)).toBe('1d');
    expect(daysLabel(12)).toBe('12d');
  });

  it('names who has it, "You" when it is mine, with the time', () => {
    expect(cellText(step({ position: 1, label: 'Architect', state: 'current', days: 5 }), false)).toEqual({ label: 'Architect', time: '5d' });
    expect(cellText(step({ position: 1, label: 'Architect', state: 'current', days: 0 }), true)).toEqual({ label: 'You', time: '<1d' });
    // "You" is only for the step that has it now.
    expect(cellText(step({ position: 0, label: 'Sub', state: 'done', days: 1 }), true)).toEqual({ label: 'Sub', time: '1d' });
    expect(cellText(step({ position: 4, label: 'Answered', kind: 'answered', state: 'next' }), false)).toEqual({ label: 'Answered', time: '' });
  });

  it('hover words: who and when, on the job calendar', () => {
    const done = step({ position: 1, state: 'done', person_name: 'Sample Inspector', entered_at: '2026-09-24T16:00:00Z', left_at: '2026-09-26T16:00:00Z' });
    expect(cellTitle(done, TZ)).toBe('Sample Inspector · Sep 24 to Sep 26');
    const now = step({ position: 3, label: 'Architect', state: 'current', entered_at: '2026-09-25T06:00:00Z' });
    expect(cellTitle(now, TZ)).toBe('Architect · since Sep 24');
    expect(cellTitle(step({ position: 2, label: 'PM / PE' }), TZ)).toBe('PM / PE');
    expect(cellTitle(step({ position: 4, kind: 'answered', label: 'Answered', state: 'done', entered_at: '2026-09-27T16:00:00Z' }), TZ)).toBe('Answered Sep 27');
  });

  it('groups a job\'s steps by RFI, each in route order', () => {
    const by = stripsByRfi([step({ position: 1 }), step({ rfi_id: 'r2', position: 0 }), step({ position: 0 })]);
    expect(by.get('r1')?.map((s) => s.position)).toEqual([0, 1]);
    expect(by.get('r2')).toHaveLength(1);
    expect(by.get('r3')).toBeUndefined();
  });
});

describe('a log row', () => {
  it('shows the due date while the architect has it, red once past it', () => {
    expect(dueMark({ status: 'open', due_at: '2026-10-03T19:00:00Z' }, TZ, NOW)).toEqual({ text: 'Due Oct 3', late: false });
    expect(dueMark({ status: 'open', due_at: '2026-09-26T19:00:00Z' }, TZ, NOW)).toEqual({ text: 'Due Sep 26', late: true });
    expect(dueMark({ status: 'open', due_at: '2026-09-28T23:00:00Z' }, TZ, NOW)).toEqual({ text: 'Due today', late: false });
    expect(dueMark({ status: 'open', due_at: '2026-09-28T17:00:00Z' }, TZ, NOW)).toEqual({ text: 'Due today', late: true });
    expect(dueMark({ status: 'answered', due_at: '2026-09-26T19:00:00Z' }, TZ, NOW)).toBeNull();
    expect(dueMark({ status: 'review', due_at: null }, TZ, NOW)).toBeNull();
  });

  it('a number once issued, "Draft" for a draft, nothing in between', () => {
    expect(rowNumber({ number: 4, status: 'open' })).toBe('004');
    expect(rowNumber({ number: null, status: 'draft' })).toBe('Draft');
    expect(rowNumber({ number: null, status: 'review' })).toBe('');
    expect(rowNumber({ number: 2, status: 'void' })).toBe('002');
  });
});

describe('the PDF buttons', () => {
  it('wait until the RFI was sent, unless a PDF exists', () => {
    expect(pdfWait({ sent_at: null, pdf_file_id: null })).toBe('Not sent yet');
    expect(pdfWait({ sent_at: '2026-09-20T17:00:00Z', pdf_file_id: null })).toBeNull();
    expect(pdfWait({ sent_at: null, pdf_file_id: 'f1' })).toBeNull();
  });
});
