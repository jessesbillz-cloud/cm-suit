// A wall's rev strip worked out (Jesse, Oct 6: "rooms then walls with the revs"): one chip per rev of its list, in the
// list's order, each the wall's items of that rev rolled up (the checklist's rule: N/A, failed, done, requested, open).
// A done rev shows the OFS IR number that passed it (the newest when its items passed apart), and the file of that
// sign-off before the app when one is on file (rev_signoffs.file_id), which a tap opens. A rev the wall doesn't need
// (every item N/A) has no chip. Pure; tested in revStrip.test.ts.
import type { Rev, RevArea, RevSetup } from '../../data/revs.types';
import type { SignoffFile } from '../../data/revs.history';
import type { BoxState } from './boxLook';
import { MARKS, revCell, type CheckMark } from './checklist';
import { cellOf, signedBefore, type StatusIndex } from './model';

/** The sign-offs' files by wall and item. */
export type SignoffFiles = ReadonlyMap<string, string>;

const key = (areaId: string, itemId: string) => `${areaId}:${itemId}`;

export function indexSignoffFiles(rows: readonly SignoffFile[]): SignoffFiles {
  return new Map(rows.map((r) => [key(r.area_id, r.item_id), r.file_id]));
}

export interface StripChip {
  rev: Rev;
  /** Never N/A: such a rev has no chip. */
  mark: Exclude<CheckMark, 'na'>;
  /** Done: the OFS IR number that passed it, when known. */
  ofsNumber: number | null;
  /** Done before the app: that OFS IR's file, when on file. */
  fileId: string | null;
}

/** The wall's revs it needs (a rev not applicable on it is left out, Jesse Oct 12), each rolled up. */
export function revStrip(setup: RevSetup, index: StatusIndex, area: RevArea, files: SignoffFiles): StripChip[] {
  return setup.revs
    .filter((r) => r.list_id === area.list_id)
    .flatMap((rev): StripChip[] => {
      const { mark } = revCell(setup, index, area, rev);
      if (mark === 'na') return [];
      if (mark !== 'done') return [{ rev, mark, ofsNumber: null, fileId: null }];
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
      return [{ rev, mark, ofsNumber, fileId }];
    });
}

/** Each shown mark as a box (boxLook): done the whole box green, requested gold, failed red, open white. */
export function markBox(mark: Exclude<CheckMark, 'na'>): BoxState {
  return mark === 'done' ? 'passed' : mark;
}

const ofs = (n: number) => String(n).padStart(4, '0');

/** How a chip is labeled: its number (compact), its name (a room's rows, Jesse Oct 11), or both. */
export type ChipLabel = 'number' | 'name' | 'both';

/** What a chip says: the rev's number, its name or both, and with a number a done rev's OFS number. */
export function chipText(chip: StripChip, label: ChipLabel): string {
  if (label === 'name') return chip.rev.name;
  const rev = label === 'both' ? `${String(chip.rev.number)} ${chip.rev.name}` : String(chip.rev.number);
  return chip.ofsNumber !== null ? `${rev} · ${ofs(chip.ofsNumber)}` : rev;
}

/** Its whole name, spoken and on hover: "Rev 3 Drywall: Done, OFS 0041". */
export function chipName(chip: StripChip): string {
  const said = `Rev ${String(chip.rev.number)} ${chip.rev.name}: ${MARKS[chip.mark].label}`;
  return chip.ofsNumber !== null ? `${said}, OFS ${ofs(chip.ofsNumber)}` : said;
}
