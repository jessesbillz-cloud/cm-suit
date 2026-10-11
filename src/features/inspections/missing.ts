// What a new request still needs before it can go, in the order the form shows it (Jesse, Oct 10: "the submit button
// wouldn't ever highlight"). The bar says the first one in a few words, and a tap on Request jumps to it. Pure; tested
// in missing.test.ts.
import type { IrKind } from '../../data/inspections.types';

export type Missing =
  | 'what'
  | 'walls'
  | 'company'
  | 'day'
  | 'special_kind'
  | 'items'
  | 'special_required'
  | 'upload'
  | 'notice'
  | 'statement';

export const MISSING_HINT: Record<Missing, string> = {
  what: 'Pick what to inspect',
  walls: 'Pick a wall',
  company: 'Add your company',
  day: 'Pick a day',
  special_kind: 'Pick the special inspection',
  items: 'Type what to inspect',
  special_required: 'Special inspection? Yes or No',
  upload: 'Wait for the upload',
  notice: 'Tick the notice',
  statement: 'Tick the statement',
};

export interface RequestState {
  kind: IrKind;
  /** Walls and items picked from the job's revs (an OFS request on a job with revs): they come first on the form. */
  revs: { items: number; walls: number } | null;
  company: string;
  dayOk: boolean;
  /** The special inspection picked (a Special request). */
  special: string;
  /** The items typed (a request without walls to pick). */
  items: string;
  /** An OFS request's question; null until answered. */
  specialRequired: boolean | null;
  uploading: boolean;
  /** Which box the form shows: the notice, the inspector's one statement, or none (the attestation says it). */
  box: 'notice' | 'statement' | null;
  ticked: boolean;
}

/** Every missing answer, in screen order; empty when the request can go. */
export function missingOf(s: RequestState): Missing[] {
  const out: Missing[] = [];
  const add = (gap: boolean, m: Missing) => {
    if (gap) out.push(m);
  };
  if (s.revs !== null) {
    add(s.revs.items === 0, 'what');
    add(s.revs.items > 0 && s.revs.walls === 0, 'walls');
  }
  add(s.company.trim() === '', 'company');
  add(!s.dayOk, 'day');
  add(s.kind === 'special' && s.special === '', 'special_kind');
  add(s.revs === null && s.items.trim() === '', 'items');
  add(s.kind === 'ofs' && s.specialRequired === null, 'special_required');
  add(s.uploading, 'upload');
  if (s.box !== null) add(!s.ticked, s.box);
  return out;
}
