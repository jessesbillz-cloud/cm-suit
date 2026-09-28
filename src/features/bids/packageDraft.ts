// A new package (SPEC §11.2): the estimator's codes are the CSI division plus a letter (09A, 09B...). Picking a division
// suggests its next free code and names the package after the division. Suggestions only: the database's unique
// (project, code) is what decides.
import { nextPackageCode } from './model';

/** The right-column item that holds the new-package form (never a row id: rows are uuids). */
export const NEW_PACKAGE_ITEM = 'new-package';

const LETTERS: readonly string[] = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

interface DivisionLike {
  number: string;
  title: string;
  reserved: boolean;
}

/** The division a package code belongs to ('09B' -> '09'), or null when the code is not a division plus a letter. */
export function divisionOfCode(code: string): string | null {
  return /^\d{2}[A-Z]$/.test(code) ? code.slice(0, 2) : null;
}

/**
 * The next code in a division: the letter after the highest one the job uses there (09A, 09B -> 09C), else the first
 * free letter; 09A when the division is new to the job; null when all 26 are taken.
 */
export function suggestCode(division: string, codes: readonly string[]): string | null {
  const used = new Set(codes.filter((c) => divisionOfCode(c) === division).map((c) => c.charAt(2)));
  const highest = Math.max(-1, ...[...used].map((l) => LETTERS.indexOf(l)));
  const after = LETTERS.slice(highest + 1).find((l) => !used.has(l));
  const free = after ?? LETTERS.find((l) => !used.has(l));
  return free === undefined ? null : `${division}${free}`;
}

/** What is wrong with a package's code and name before saving, in a few words; null when nothing is. */
export function packageProblem(code: string, name: string): string | null {
  if (divisionOfCode(code) === null) return 'Code looks like 09A.';
  if (name === '') return 'Name is empty.';
  return null;
}

/** The divisions a package can be in: every one that is not reserved, except 00 (procurement, not a trade). */
export function packageDivisions<T extends DivisionLike>(divisions: readonly T[]): T[] {
  return divisions.filter((d) => !d.reserved && d.number !== '00');
}

/** Where a new package starts: the division of the job's next code in order (01 for an empty job). */
export function startingDivision(codes: readonly string[], divisions: readonly DivisionLike[]): string {
  const next = nextPackageCode(codes).slice(0, 2);
  const open = packageDivisions(divisions);
  return (open.find((d) => d.number >= next) ?? open[0])?.number ?? next;
}
