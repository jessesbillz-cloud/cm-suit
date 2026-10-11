// A wall's rev strip worked out (Jesse, Oct 6: "rooms then walls with the revs"): one chip per rev of its list, in the
// list's order, each the wall's items of that rev rolled up (the checklist's rule: N/A, failed, done, requested, open).
// A done rev shows the OFS IR number that passed it (the newest when its items passed apart), and the file of that
// sign-off before the app when one is on file (rev_signoffs.file_id), which a tap opens. Pure; tested in
// revStrip.test.ts.
import type { Rev, RevArea, RevSetup } from '../../data/revs.types';
import type { SignoffRow } from '../../data/revs.history';
import type { StatusKey } from '../../lib/status';
import { MARKS, revCell, type CheckMark } from './checklist';
import { cellOf, signedBefore, type StatusIndex } from './model';

/** The sign-offs' files by wall and item. */
export type SignoffFiles = ReadonlyMap<string, string>;

const key = (areaId: string, itemId: string) => `${areaId}:${itemId}`;

/** The sign-offs with their OFS IR on file, by wall and item. */
export function indexSignoffFiles(rows: readonly Pick<SignoffRow, 'area_id' | 'item_id' | 'file_id'>[]): SignoffFiles {
  return new Map(rows.flatMap((r) => (r.file_id !== null ? [[key(r.area_id, r.item_id), r.file_id] as const] : [])));
}

export interface StripChip {
  rev: Rev;
  mark: CheckMark;
  /** Done: the OFS IR number that passed it, when known. */
  ofsNumber: number | null;
  /** Done before the app: that OFS IR's file, when on file. */
  fileId: string | null;
}

export function revStrip(setup: RevSetup, index: StatusIndex, area: RevArea, files: SignoffFiles): StripChip[] {
  return setup.revs
    .filter((r) => r.list_id === area.list_id)
    .map((rev) => {
      const { mark } = revCell(setup, index, area, rev);
      if (mark !== 'done') return { rev, mark, ofsNumber: null, fileId: null };
      const passed = setup.items
        .filter((i) => i.rev_id === rev.id)
        .map((i) => cellOf(index, area.id, i.id))
        .filter((c) => c.status === 'passed')
        .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || (b.ofs_number ?? 0) - (a.ofs_number ?? 0));
      const shown = passed.find((c) => c.ofs_number !== null) ?? passed[0];
      const ofsNumber = shown?.ofs_number ?? null;
      const fileId =
        passed
          .filter((c) => signedBefore(c) && c.ofs_number === ofsNumber)
          .map((c) => files.get(key(c.area_id, c.item_id)))
          .find((f) => f !== undefined) ?? null;
      return { rev, mark, ofsNumber, fileId };
    });
}

/** Each mark's lib/status colors: done green, requested gold, failed red, open plain, N/A muted. */
export function chipKey(mark: CheckMark): StatusKey {
  return MARKS[mark].key;
}

const ofs = (n: number) => String(n).padStart(4, '0');

/** What a chip says: the rev's number (with its name when there is room), and a done rev's OFS number. */
export function chipText(chip: StripChip, withName: boolean): string {
  const rev = withName ? `${String(chip.rev.number)} ${chip.rev.name}` : String(chip.rev.number);
  return chip.ofsNumber !== null ? `${rev} · ${ofs(chip.ofsNumber)}` : rev;
}

/** Its whole name, spoken and on hover: "Rev 3 Drywall: Done, OFS 0041". */
export function chipName(chip: StripChip): string {
  const said = `Rev ${String(chip.rev.number)} ${chip.rev.name}: ${MARKS[chip.mark].label}`;
  return chip.ofsNumber !== null ? `${said}, OFS ${ofs(chip.ofsNumber)}` : said;
}
