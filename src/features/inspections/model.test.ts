import { describe, expect, it } from 'vitest';
import { STATUS } from '../../lib/status';
import { dayMeta, inspectorSteps, logTitle, parseView, requestChip, requestCount, rowChip, trackerSteps, viewsFor } from './model';

const base = { status: 'pending', result: null, helper_id: null };

describe('chips', () => {
  it('maps every request state to a lib/status color', () => {
    // [status, result, helper, chip color, chip label]
    const cases: [string, string | null, string | null, string, string][] = [
      ['gc_review', null, null, 'pending', 'GC review'],
      ['returned', null, null, 'blocked', 'Returned'],
      ['pending', null, null, 'pending', 'Pending'],
      ['confirmed', null, null, 'confirmed', 'Confirmed'],
      ['confirmed', null, 'u2', 'assigned', 'Helper'],
      ['postponed', null, null, 'postponed', 'Postponed'],
      ['complete', 'approved', null, 'approved', 'Approved'],
      ['confirmed', 'not_approved', null, 'not_approved', 'Not approved'],
      ['withdrawn', null, null, 'cancelled', 'Withdrawn'],
    ];
    for (const [status, result, helper, color, label] of cases) {
      const chip = requestChip({ status, result, helper_id: helper });
      expect(chip).toEqual({ status: color, label });
      expect(STATUS[chip.status]).toBeDefined();
    }
  });
  it('someone else\'s line shows only its color; blocked time is blocked', () => {
    expect(rowChip({ ...base, status: 'confirmed', is_block: false, full_detail: false, status_key: 'approved' })).toEqual({ status: 'approved', label: 'Approved' });
    expect(rowChip({ ...base, is_block: true, full_detail: false, status_key: 'blocked' })).toEqual({ status: 'blocked', label: 'Blocked' });
    expect(rowChip({ ...base, is_block: false, full_detail: false, status_key: 'nonsense' }).status).toBe('pending');
  });
});

describe('tracker', () => {
  const labels = (s: ReturnType<typeof trackerSteps>) => s.map((x) => `${x.label}:${x.state}`);
  it('has no GC step when the job has it off', () => {
    expect(labels(trackerSteps({ status: 'pending', result: null, gc_at: null }, false))).toEqual([
      'Submitted:done', 'Inspector:current', 'Result:todo',
    ]);
  });
  it('shows the GC step when it is on', () => {
    expect(labels(trackerSteps({ status: 'gc_review', result: null, gc_at: null }, true))).toEqual([
      'Submitted:done', 'GC:current', 'Inspector:todo', 'Result:todo',
    ]);
    expect(labels(trackerSteps({ status: 'returned', result: null, gc_at: 'x' }, true))[1]).toBe('Returned:failed');
  });
  it('confirmed, postponed, done', () => {
    expect(labels(trackerSteps({ status: 'confirmed', result: null, gc_at: null }, false))).toEqual([
      'Submitted:done', 'Confirmed:done', 'Result:current',
    ]);
    expect(labels(trackerSteps({ status: 'postponed', result: null, gc_at: null }, false))[1]).toBe('Postponed:failed');
    expect(labels(trackerSteps({ status: 'complete', result: 'approved', gc_at: null }, false)).at(-1)).toBe('Approved:done');
  });
});

describe('views and the log', () => {
  it('inspectors start on the day; the GC review list only with the GC step', () => {
    expect(viewsFor({ decide: true, review: false })).toEqual(['day', 'week', 'log']);
    expect(viewsFor({ decide: false, review: true })).toEqual(['week', 'log', 'review']);
    expect(parseView('day', ['week', 'log'])).toBe('week');
    expect(parseView('log', ['week', 'log'])).toBe('log');
  });
  it('titles and counts', () => {
    const r = { kind: 'special', company: 'Sample Co', items: '\nSlab pour\nmore', status: 'complete', result: 'approved', ir_special_kinds: { name: 'Concrete' } };
    expect(logTitle(r)).toBe('Special: Concrete · Sample Co · Slab pour (Approved)');
    expect(requestCount([{ postpone_count: 0 }, { postpone_count: 2 }])).toEqual({ requests: 4, postponed: 2 });
  });
});

describe('inspector step cards', () => {
  const row = { status: 'pending', result: null, attendance: null, ir_file_id: null, pdf_stale: false, results_sent_at: null };
  it('starts on Confirm; Result can be recorded any time; IR and Send wait', () => {
    expect(inspectorSteps(row)).toEqual({ confirm: 'current', attendance: 'open', result: 'open', pdf: 'todo', send: 'todo' });
  });
  it('moves to Result, then the IR, then Send results', () => {
    expect(inspectorSteps({ ...row, status: 'confirmed', attendance: 'alone' })).toEqual({
      confirm: 'done', attendance: 'done', result: 'current', pdf: 'todo', send: 'todo',
    });
    expect(inspectorSteps({ ...row, status: 'confirmed', result: 'approved' }).pdf).toBe('current');
    const made = { ...row, status: 'complete', result: 'approved', ir_file_id: 'f1' };
    expect(inspectorSteps(made)).toMatchObject({ pdf: 'done', send: 'current' });
    expect(inspectorSteps({ ...made, pdf_stale: true })).toMatchObject({ pdf: 'current', send: 'todo' });
    expect(inspectorSteps({ ...made, results_sent_at: '2026-09-28T20:00:00Z' }).send).toBe('done');
  });
  it('a postponed request is confirmed again first', () => {
    expect(inspectorSteps({ ...row, status: 'postponed' })).toMatchObject({ confirm: 'current', result: 'todo', pdf: 'todo' });
  });
});

describe('dayMeta', () => {
  const line = { ...base, is_block: false, full_detail: true, status_key: 'pending' };
  it('counts the day and what is still pending, never blocked time', () => {
    expect(dayMeta([])).toBe('Nothing today');
    expect(dayMeta([{ ...line, is_block: true, status_key: 'blocked' }])).toBe('Nothing today');
    expect(dayMeta([line, { ...line, status: 'confirmed' }, { ...line, status: 'confirmed' }])).toBe('Today · 3 requests · 1 pending');
    expect(dayMeta([{ ...line, status: 'confirmed' }])).toBe('Today · 1 request');
  });
});
