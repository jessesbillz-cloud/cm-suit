import { describe, expect, it } from 'vitest';
import { canSend, ofsCheckRights } from './ofsFlow';

const BASE = {
  kind: 'ofs',
  status: 'gc_review',
  gc_at: null,
  owner_id: null,
  result: null,
  ofs_sent_at: null,
  ofs_sent_by: null,
  ofs_ready_at: null,
  ofs_si_at: null,
  special_required: true,
};
const GC = { gcApprove: true, decide: false };
const INSPECTOR = { gcApprove: false, decide: true };
const SUB = { gcApprove: false, decide: false };
const AT = '2026-10-05T16:00:00Z';

describe('ofsCheckRights', () => {
  it('a sub taps nothing', () => {
    expect(Object.values(ofsCheckRights(BASE, SUB, 'me')).some(Boolean)).toBe(false);
  });
  it('the GC checks Ready while it is with him, and undoes it until the inspector checks', () => {
    expect(ofsCheckRights(BASE, GC, 'me').gc).toBe(true);
    const past = { ...BASE, status: 'pending', gc_at: AT };
    expect(ofsCheckRights(past, GC, 'me')).toMatchObject({ gc: false, gcUndo: true });
    expect(ofsCheckRights({ ...past, ofs_ready_at: AT }, GC, 'me').gcUndo).toBe(false);
  });
  it('the inspector: Ready after the GC, then the SI report, Undo in order', () => {
    expect(ofsCheckRights(BASE, INSPECTOR, 'me')).toMatchObject({ ready: false, si: false });
    const past = { ...BASE, status: 'pending', gc_at: AT };
    expect(ofsCheckRights(past, INSPECTOR, 'me')).toMatchObject({ ready: true, si: false });
    const ready = { ...past, ofs_ready_at: AT };
    expect(ofsCheckRights(ready, INSPECTOR, 'me')).toMatchObject({ ready: false, readyUndo: true, si: true });
    expect(ofsCheckRights({ ...ready, ofs_si_at: AT }, INSPECTOR, 'me')).toMatchObject({ readyUndo: false, siUndo: true });
  });
  it('no SI report without a special inspection', () => {
    const ready = { ...BASE, status: 'pending', gc_at: AT, ofs_ready_at: AT, special_required: false };
    expect(ofsCheckRights(ready, INSPECTOR, 'me').si).toBe(false);
  });
});

describe('canSend', () => {
  it('the inspector sends on his own word; the duty holder once the inspector has checked it', () => {
    expect(canSend(BASE, true)).toBe(true);
    expect(canSend({ ...BASE, ofs_ready_at: AT }, false)).toBe(false);
    expect(canSend({ ...BASE, ofs_ready_at: AT, ofs_si_at: AT }, false)).toBe(true);
    expect(canSend({ ...BASE, ofs_ready_at: AT, special_required: false }, false)).toBe(true);
  });
});
