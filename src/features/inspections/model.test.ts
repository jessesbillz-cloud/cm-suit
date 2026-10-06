import { describe, expect, it } from 'vitest';
import { STATUS } from '../../lib/status';
import {
  actionLabel,
  dayMeta,
  decidesRequest,
  inspectorSteps,
  logTitle,
  ownsSteps,
  parseView,
  requestChip,
  requestCount,
  resultOpen,
  routesOnly,
  rowChip,
  trackerSteps,
  viewsFor,
  waitingOn,
  withOfs,
} from './model';

const base = { status: 'pending', result: null, helper_id: null };

describe('chips', () => {
  it('maps every request state to a lib/status color', () => {
    // [status, result, helper, chip color, chip label]
    const cases: [string, string | null, string | null, string, string][] = [
      ['gc_review', null, null, 'gc_review', 'GC review'],
      ['returned', null, null, 'blocked', 'Returned'],
      ['pending', null, null, 'pending', 'Pending'],
      ['confirmed', null, null, 'confirmed', 'Confirmed'],
      ['confirmed', null, 'u2', 'confirmed', 'Helper'],
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
  it('a pending request sent to OFS reads "With OFS"; to the deputy it is Pending; the color is pending either way', () => {
    const sent = { ...base, kind: 'ofs', ofs_sent_at: '2026-10-03T16:00:00Z' };
    expect(requestChip(sent)).toEqual({ status: 'pending', label: 'With OFS' });
    expect(requestChip(sent, true)).toEqual({ status: 'pending', label: 'Pending' });
    expect(requestChip({ ...base, kind: 'ofs', ofs_sent_at: null })).toEqual({ status: 'pending', label: 'Pending' });
    expect(requestChip({ ...sent, status: 'confirmed' }).label).toBe('Confirmed');
    const line = { ...base, kind: 'ofs', ofs_sent: true, is_block: false, full_detail: true, status_key: 'pending' };
    expect(rowChip(line).label).toBe('With OFS');
    expect(rowChip(line, true).label).toBe('Pending');
  });
});

describe('the OFS route (SPEC §18.4 P1)', () => {
  const inspector = { decide: true, ofsDecide: false };
  const deputy = { decide: false, ofsDecide: true };
  const unsent = { kind: 'ofs', ofs_sent_at: null };
  const sent = { kind: 'ofs', ofs_sent_at: '2026-10-03T16:00:00Z' };
  it("one rule: an OFS request sent to OFS is the deputy's; every other request is the inspector's", () => {
    expect(decidesRequest({ kind: 'ior', ofs_sent_at: null }, inspector)).toBe(true);
    expect(decidesRequest({ kind: 'special', ofs_sent_at: null }, deputy)).toBe(false);
    expect(decidesRequest(unsent, inspector)).toBe(true);
    expect(decidesRequest(unsent, deputy)).toBe(false);
    expect(decidesRequest(sent, inspector)).toBe(false);
    expect(decidesRequest(sent, deputy)).toBe(true);
    // The calendar's lines and the link's answer carry ofs_sent; only an OFS request is ever with OFS.
    expect(decidesRequest({ kind: 'ofs', ofs_sent: true }, deputy)).toBe(true);
    expect(withOfs({ kind: 'ior', ofs_sent: true })).toBe(false);
  });
  it('before it is sent the inspector only routes an OFS request', () => {
    expect(routesOnly(unsent)).toBe(true);
    expect(routesOnly(sent)).toBe(false);
    expect(routesOnly({ kind: 'ior', ofs_sent_at: null })).toBe(false);
  });
  it("steps are mine on a request past the GC that is mine or nobody's", () => {
    expect(ownsSteps({ status: 'pending', owner_id: null }, 'me')).toBe(true);
    expect(ownsSteps({ status: 'confirmed', owner_id: 'other' }, 'me')).toBe(false);
    expect(ownsSteps({ status: 'gc_review', owner_id: null }, 'me')).toBe(false);
    // Sent before the route existed: its owner is the inspector who sent it, nobody among the deputies.
    expect(ownsSteps({ ...sent, status: 'confirmed', owner_id: 'inspector-1', ofs_sent_by: 'inspector-1' }, 'deputy-1')).toBe(true);
    expect(ownsSteps({ ...sent, status: 'confirmed', owner_id: 'deputy-1', ofs_sent_by: 'inspector-1' }, 'deputy-2')).toBe(false);
  });
  it('history and receipts name the route', () => {
    expect(actionLabel('send_ofs')).toBe('Sent to OFS');
    expect(actionLabel('unsend_ofs')).toBe('Send undone');
    expect(waitingOn({ status: 'gc_review', kind: 'ofs' })).toBe('Waiting on the GC.');
    expect(waitingOn({ ...unsent, status: 'pending' })).toBe('Waiting on the inspector.');
    expect(waitingOn({ ...sent, status: 'pending' })).toBe('Waiting on OFS.');
    expect(waitingOn({ status: 'pending', kind: 'ior' })).toBe('Waiting on the inspector.');
    expect(waitingOn({ status: 'confirmed', kind: 'ior' })).toBeNull();
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
  it('an OFS request: Submitted, GC, Inspector, OFS, Result', () => {
    const ofs = { kind: 'ofs', result: null, gc_at: null, ofs_sent_at: null };
    // The GC step shows while the request is with the GC, even with the job's own step off.
    expect(labels(trackerSteps({ ...ofs, status: 'gc_review' }, false))).toEqual([
      'Submitted:done', 'GC:current', 'Inspector:todo', 'OFS:todo', 'Result:todo',
    ]);
    const past = { ...ofs, gc_at: '2026-10-03T16:00:00Z' };
    expect(labels(trackerSteps({ ...past, status: 'pending' }, false))).toEqual([
      'Submitted:done', 'GC:done', 'Inspector:current', 'OFS:todo', 'Result:todo',
    ]);
    expect(labels(trackerSteps({ ...past, status: 'postponed' }, false)).slice(2)).toEqual(['Postponed:failed', 'OFS:todo', 'Result:todo']);
    const sent = { ...past, ofs_sent_at: '2026-10-03T17:00:00Z' };
    expect(labels(trackerSteps({ ...sent, status: 'pending' }, false)).slice(2)).toEqual(['Inspector:done', 'OFS:current', 'Result:todo']);
    expect(labels(trackerSteps({ ...sent, status: 'postponed' }, false)).slice(2)).toEqual(['Inspector:done', 'Postponed:failed', 'Result:todo']);
    expect(labels(trackerSteps({ ...sent, status: 'confirmed' }, false)).slice(2)).toEqual(['Inspector:done', 'Confirmed:done', 'Result:current']);
    expect(labels(trackerSteps({ ...sent, status: 'complete', result: 'approved' }, false)).slice(3)).toEqual(['Confirmed:done', 'Approved:done']);
    expect(labels(trackerSteps({ ...sent, status: 'confirmed', result: 'not_approved' }, false)).at(-1)).toBe('Not approved:failed');
    // Withdrawn: nothing past the GC is reached.
    expect(labels(trackerSteps({ ...sent, status: 'withdrawn' }, false)).slice(2)).toEqual(['Inspector:todo', 'OFS:todo', 'Result:todo']);
  });
  it("the inspector's own OFS request skips the GC; the link's answer carries ofs_sent", () => {
    expect(labels(trackerSteps({ kind: 'ofs', status: 'pending', result: null, gc_at: null, ofs_sent: true }, false))).toEqual([
      'Submitted:done', 'Inspector:done', 'OFS:current', 'Result:todo',
    ]);
    expect(labels(trackerSteps({ kind: 'ofs', status: 'pending', result: null, gc_at: null, ofs_sent: false }, true))).toEqual([
      'Submitted:done', 'GC:done', 'Inspector:current', 'OFS:todo', 'Result:todo',
    ]);
  });
});

describe('views and the log', () => {
  it('inspectors start on the day; the GC review list only with the GC step', () => {
    expect(viewsFor({ decide: true, review: false })).toEqual(['day', 'week', 'log']);
    expect(viewsFor({ decide: false, review: true })).toEqual(['week', 'log', 'review']);
    expect(viewsFor({ decide: true, review: true })).toEqual(['day', 'week', 'log', 'review']);
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
  it('starts on Confirm; attendance any time; Result waits for Confirm, as do the IR and Send', () => {
    expect(inspectorSteps(row)).toEqual({ confirm: 'current', attendance: 'open', result: 'todo', pdf: 'todo', send: 'todo' });
    expect(inspectorSteps({ ...row, attendance: 'be_present' })).toEqual({
      confirm: 'current', attendance: 'done', result: 'todo', pdf: 'todo', send: 'todo',
    });
    expect([resultOpen('pending'), resultOpen('postponed'), resultOpen('confirmed'), resultOpen('complete')]).toEqual([false, false, true, true]);
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
  it('a request with OFS is pending to the deputy, never in the inspector\'s count', () => {
    const withOfsLine = { ...line, kind: 'ofs', ofs_sent: true };
    expect(dayMeta([line, withOfsLine])).toBe('Today · 2 requests · 1 pending');
    expect(dayMeta([withOfsLine])).toBe('Today · 1 request');
    expect(dayMeta([withOfsLine], true)).toBe('Today · 1 request · 1 pending');
    // Not sent yet: still the inspector's.
    expect(dayMeta([{ ...line, kind: 'ofs', ofs_sent: false }])).toBe('Today · 1 request · 1 pending');
  });
});
