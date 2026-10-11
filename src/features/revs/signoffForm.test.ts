import { describe, expect, it } from 'vitest';
import type { OfsFile } from '../../data/revs.types';
import { draftOf, fileFor, ofsOf, shortList, valuesOf } from './signoffForm';

const f = (ofs: number): OfsFile => ({ ofs, fileId: `f${String(ofs)}`, name: `OFS_IR_${String(ofs).padStart(4, '0')}.pdf` });
// Highest first, as data/revs.ofsFiles answers.
const FILES = [68, 52, 45, 44, 41, 40, 7, 4].map(f);

describe('the sign-off form', () => {
  it('opens with the sign-off being changed, else the number and day last used, else empty', () => {
    expect(draftOf({ ofs_number: 41, signed_on: '2026-09-21', note: 'Sample' }, { ofsNumber: 52, signedOn: null })).toEqual({
      ofs: '41', day: '2026-09-21', note: 'Sample',
    });
    expect(draftOf({ ofs_number: null, signed_on: null, note: null }, null)).toEqual({ ofs: '', day: '', note: '' });
    expect(draftOf(null, { ofsNumber: 52, signedOn: '2026-09-28' })).toEqual({ ofs: '52', day: '2026-09-28', note: '' });
    expect(draftOf(null, null)).toEqual({ ofs: '', day: '', note: '' });
  });

  it('saves a whole number of 1 or more, or none; the rest as typed, empty as none', () => {
    expect(valuesOf({ ofs: ' 41 ', day: '2026-09-21', note: ' Paper IR ' })).toEqual({ ofsNumber: 41, signedOn: '2026-09-21', note: 'Paper IR' });
    expect(valuesOf({ ofs: '', day: '', note: ' ' })).toEqual({ ofsNumber: null, signedOn: null, note: null });
    expect(valuesOf({ ofs: '0', day: '', note: '' })).toBeNull();
    expect(valuesOf({ ofs: '4.5', day: '', note: '' })).toBeNull();
    expect(ofsOf('0041')).toBe(41);
  });

  it('a short list of IRs: those starting with what is typed, lowest first, else the newest', () => {
    expect(shortList(FILES, '').map((x) => x.ofs)).toEqual([68, 52, 45, 44, 41, 40]);
    expect(shortList(FILES, '4').map((x) => x.ofs)).toEqual([4, 40, 41, 44, 45]);
    expect(shortList(FILES, '004').map((x) => x.ofs)).toEqual([4, 40, 41, 44, 45]);
    expect(shortList(FILES, '41').map((x) => x.ofs)).toEqual([41]);
    expect(shortList(FILES, '9')).toEqual([]);
  });

  it("the IR linked is the number's, when there is one", () => {
    expect(fileFor(FILES, '0041')?.fileId).toBe('f41');
    expect(fileFor(FILES, '42')).toBeNull();
    expect(fileFor(FILES, '')).toBeNull();
    expect(fileFor(FILES, 'x')).toBeNull();
  });
});
