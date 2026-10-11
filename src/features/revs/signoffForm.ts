// The sign-off form worked out (Jesse, Oct 10: "I know you missed quite a few of the previous sign-offs, so I need to be
// able to go in there and make the changes"). It opens with the sign-off being changed, else the OFS number and day
// last used on the job this session (one after another, the same paper IR), else empty. The job's OFS IRs by number
// (data/revs.ofsFiles) make a short list under the number: the ones starting with what is typed, else the newest; a
// tap fills the number, and the IR of the number given is linked with it (0094's rule). Pure; tested in
// signoffForm.test.ts.
import type { OfsFile } from '../../data/revs.ofsFiles';
import type { RevSignoff, SignoffValues } from '../../data/revs.walls';

/** What the form holds, as typed. */
export interface SignoffDraft {
  ofs: string;
  day: string;
  note: string;
}

/** The OFS number and day last saved on the job this session. */
export interface LastSignoff {
  ofsNumber: number | null;
  signedOn: string | null;
}

const EMPTY: SignoffDraft = { ofs: '', day: '', note: '' };

/** The sign-off being changed as it is; a new one with the last number and day used; else nothing. */
export function draftOf(current: Pick<RevSignoff, 'ofs_number' | 'signed_on' | 'note'> | null, last: LastSignoff | null): SignoffDraft {
  if (current) return { ofs: current.ofs_number === null ? '' : String(current.ofs_number), day: current.signed_on ?? '', note: current.note ?? '' };
  if (last) return { ...EMPTY, ofs: last.ofsNumber === null ? '' : String(last.ofsNumber), day: last.signedOn ?? '' };
  return EMPTY;
}

/** The number typed: null for none, NaN when it is not a whole number of 1 or more. */
export function ofsOf(typed: string): number | null {
  const t = typed.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
}

/** What is saved, or null while the number is not a whole number of 1 or more. */
export function valuesOf(draft: SignoffDraft): SignoffValues | null {
  const ofsNumber = ofsOf(draft.ofs);
  if (ofsNumber !== null && Number.isNaN(ofsNumber)) return null;
  return { ofsNumber, signedOn: draft.day === '' ? null : draft.day, note: draft.note.trim() === '' ? null : draft.note.trim() };
}

/** At most this many IRs under the number. */
const SHORT = 6;

/** The IRs under the number: those whose number starts with what is typed (lowest first), else the newest. */
export function shortList(files: readonly OfsFile[], typed: string): OfsFile[] {
  const digits = typed.trim().replace(/^0+/, '');
  if (!/^\d+$/.test(digits)) return files.slice(0, SHORT);
  return files
    .filter((f) => String(f.ofs).startsWith(digits))
    .sort((a, b) => a.ofs - b.ofs)
    .slice(0, SHORT);
}

/** The IR on file for the number given, linked with the sign-off. */
export function fileFor(files: readonly OfsFile[], typed: string): OfsFile | null {
  const n = ofsOf(typed);
  return n === null || Number.isNaN(n) ? null : (files.find((f) => f.ofs === n) ?? null);
}
