import { describe, expect, it } from 'vitest';
import { canSend, ofsCheckRights, routeAt, routeStops, sendsHere } from './ofsFlow';

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
/** The default route (0116): the contractor checks, the inspector sends. */
const DEFAULT = { gc: true, sender: 'inspector' } as const;
/** The duty holder sends after the inspector's Ready. */
const DUTY = { gc: true, sender: 'duty' } as const;

describe('ofsCheckRights', () => {
  it('a sub taps nothing', () => {
    expect(Object.values(ofsCheckRights(BASE, SUB, 'me', DUTY)).some(Boolean)).toBe(false);
  });
  it('the GC checks Ready while it is with him, and undoes it until the inspector checks', () => {
    expect(ofsCheckRights(BASE, GC, 'me', DUTY).gc).toBe(true);
    const past = { ...BASE, status: 'pending', gc_at: AT };
    expect(ofsCheckRights(past, GC, 'me', DUTY)).toMatchObject({ gc: false, gcUndo: true });
    expect(ofsCheckRights({ ...past, ofs_ready_at: AT }, GC, 'me', DUTY).gcUndo).toBe(false);
  });
  it('where the duty holder sends, the inspector: Ready after the GC, then the SI report, Undo in order', () => {
    expect(ofsCheckRights(BASE, INSPECTOR, 'me', DUTY)).toMatchObject({ ready: false, si: false });
    const past = { ...BASE, status: 'pending', gc_at: AT };
    expect(ofsCheckRights(past, INSPECTOR, 'me', DUTY)).toMatchObject({ ready: true, si: false });
    const ready = { ...past, ofs_ready_at: AT };
    expect(ofsCheckRights(ready, INSPECTOR, 'me', DUTY)).toMatchObject({ ready: false, readyUndo: true, si: true });
    expect(ofsCheckRights({ ...ready, ofs_si_at: AT }, INSPECTOR, 'me', DUTY)).toMatchObject({ readyUndo: false, siUndo: true });
  });
  it('on the default route the inspector has no Ready: his Send is it, and the SI report needs none first', () => {
    const past = { ...BASE, status: 'pending', gc_at: AT };
    expect(ofsCheckRights(past, INSPECTOR, 'me', DEFAULT)).toMatchObject({ ready: false, si: true });
  });
  it('no SI report without a special inspection', () => {
    const ready = { ...BASE, status: 'pending', gc_at: AT, ofs_ready_at: AT, special_required: false };
    expect(ofsCheckRights(ready, INSPECTOR, 'me', DUTY).si).toBe(false);
  });
});

describe('canSend', () => {
  it('the inspector sends on his own word; the duty holder once the inspector has checked it', () => {
    expect(canSend(BASE, DEFAULT)).toBe(true);
    expect(canSend({ ...BASE, ofs_ready_at: AT }, DUTY)).toBe(false);
    expect(canSend({ ...BASE, ofs_ready_at: AT, ofs_si_at: AT }, DUTY)).toBe(true);
    expect(canSend({ ...BASE, ofs_ready_at: AT, special_required: false }, DUTY)).toBe(true);
  });
  it('Send is the inspector\'s on the default route, the duty holder\'s on his', () => {
    expect(sendsHere(DEFAULT, { inspector: true, holder: false })).toBe(true);
    expect(sendsHere(DEFAULT, { inspector: false, holder: true })).toBe(false);
    expect(sendsHere(DUTY, { inspector: true, holder: false })).toBe(false);
    expect(sendsHere(DUTY, { inspector: false, holder: true })).toBe(true);
  });
});

describe('the route on one line', () => {
  it('names its stops in order, for each setting', () => {
    expect(routeStops(DEFAULT).map((x) => x.label)).toEqual(['Contractor checks', 'Inspector sends', 'Fire marshal']);
    expect(routeStops({ gc: false, sender: 'inspector' }).map((x) => x.label)).toEqual(['Inspector sends', 'Fire marshal']);
    expect(routeStops(DUTY).map((x) => x.label)).toEqual(['Contractor checks', 'Inspector ready', 'OFS person sends', 'Fire marshal']);
  });
  it('marks where a request is', () => {
    expect(routeAt('gc', false)).toBe('gc');
    expect(routeAt('si', false)).toBe('inspector');
    expect(routeAt('send', false)).toBe('send');
    expect(routeAt(null, true)).toBe('ofs');
    expect(routeAt(null, false)).toBeNull();
  });
});
