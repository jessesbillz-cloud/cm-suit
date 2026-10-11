import { describe, expect, it } from 'vitest';
import { MISSING_HINT, missingOf, type RequestState } from './missing';

const READY: RequestState = {
  kind: 'ior',
  revs: null,
  company: 'Sample Concrete Co',
  dayOk: true,
  special: '',
  items: 'Sample footing rebar',
  specialRequired: null,
  uploading: false,
  box: 'notice',
  ticked: true,
};

const OFS: RequestState = { ...READY, kind: 'ofs', revs: { items: 1, walls: 2 }, items: '', specialRequired: false, box: 'statement' };

describe('what a request still needs', () => {
  it('nothing when it can go', () => {
    expect(missingOf(READY)).toEqual([]);
    expect(missingOf(OFS)).toEqual([]);
    expect(missingOf({ ...OFS, box: null, ticked: false })).toEqual([]);
  });

  it('a typed request: in screen order, company, day, special kind, items, upload, notice', () => {
    const all = { ...READY, kind: 'special' as const, company: ' ', dayOk: false, items: '', uploading: true, ticked: false };
    expect(missingOf(all)).toEqual(['company', 'day', 'special_kind', 'items', 'upload', 'notice']);
  });

  it("the inspector's OFS request with walls: what to inspect, then the walls, then the rest, his one statement last", () => {
    const all = { ...OFS, revs: { items: 0, walls: 0 }, company: '', specialRequired: null, ticked: false };
    expect(missingOf(all)).toEqual(['what', 'company', 'special_required', 'statement']);
    expect(missingOf({ ...all, revs: { items: 2, walls: 0 } })[0]).toBe('walls');
    expect(missingOf({ ...OFS, ticked: false })).toEqual(['statement']);
  });

  it('an OFS request typed (no revs) still asks the question', () => {
    expect(missingOf({ ...READY, kind: 'ofs', box: null })).toEqual(['special_required']);
  });

  it('says each in a few words', () => {
    expect(MISSING_HINT.special_required).toBe('Special inspection? Yes or No');
    expect(MISSING_HINT.walls).toBe('Pick a wall');
    for (const hint of Object.values(MISSING_HINT)) expect(hint.split(' ').length).toBeLessThanOrEqual(5);
  });
});
