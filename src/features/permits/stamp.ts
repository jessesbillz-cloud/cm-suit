// The stamp flow's words and pure helpers (migration 0053): the button for what stamping does now (the database says,
// permit_approved.stamp), the search over the job's PDFs, the picked order, what is left to stamp, and the result.
// Unit-tested in stamp.test.ts.
import type { RecordResult, StampMode, StampSource, StampedFile } from '../../data/permitStamp.types';

/** "Stamp and issue" before the permit is issued, "Stamp revision" after. */
export function stampLabel(mode: StampMode): string {
  return mode === 'issue' ? 'Stamp and issue' : 'Stamp revision';
}

/** The signing button, with how many files it stamps. */
export function signLabel(mode: StampMode, count: number): string {
  return count > 0 ? `${stampLabel(mode)} (${String(count)})` : stampLabel(mode);
}

/** Every typed word in the file's name or its folder's. */
export function matchesSource(s: Pick<StampSource, 'name' | 'folder_name'>, q: string): boolean {
  const hay = `${s.name} ${s.folder_name}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** Tap to pick, tap again to drop; the set keeps the order picked. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

/** The picked files without a stamped copy yet (a retry stamps only these). */
export function leftToStamp(picked: readonly string[], done: Readonly<Record<string, StampedFile>>): string[] {
  return picked.filter((id) => done[id] === undefined);
}

export type FileState = 'stamping' | 'stamped' | 'failed';

/** One word per file while it runs. */
export function stateWord(state: FileState): string {
  if (state === 'stamping') return 'Stamping';
  return state === 'stamped' ? 'Stamped' : 'Failed';
}

/** The last line of the flow. */
export function doneLabel(r: RecordResult): string {
  const files = `${String(r.files)} ${r.files === 1 ? 'file' : 'files'}`;
  return r.issued ? `Permit issued. Approved set: ${files}.` : `Approved set revised: ${files}.`;
}
