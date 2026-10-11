// A wall's items on its room's row and its tile (Jesse, Oct 8: "each of those inspectable items should be on that
// first page ... the numbers just confuse people"): one line per rev of its list, the rev written out, then its items
// as chips, each with its own state (the wall page's: rev_status), a passed one with its OFS number and, when signed off
// before the app with its IR on file (rev_signoffs.file_id), that file. Item names drop the words they repeat from
// their rev's ("HOW Cavity Stuff" under "HOW - Cavity" reads "Stuff"), worked out from the data, never a word list.
// Revs with no items are left out. Pure; tested in itemLines.test.ts.
import type { Rev, RevArea, RevItem, RevSetup, RevStatusRow } from '../../data/revs.types';
import { chipOf, signedBefore, type StatusIndex, wallRevs } from './model';
import type { SignoffFiles } from './revStrip';

type CellStatus = RevStatusRow['status'];

/** Separators left in front of what remains of a name once its rev's words are cut: " - ", " · ", " : ". */
const LEAD_SEP = /^[\s\-–—·:|]+/;
const PUNCT_END = /[:·,]+$/;

/** The rev written out, as Setup shows it: "Rev 1 · HOW - Cavity" (Jesse, Oct 8: "you can put literally the rev
 *  in it"). */
export function revLabel(rev: Pick<Rev, 'number' | 'name'>): string {
  return `Rev ${String(rev.number)} · ${rev.name.trim()}`;
}

/** A name's words (separators left out), each lower case without trailing punctuation, and where it ends. */
const words = (s: string) =>
  [...s.matchAll(/\S+/g)]
    .filter((m) => !/^[-–—·:|]+$/.test(m[0]))
    .map((m) => ({ w: m[0].replace(PUNCT_END, '').toLowerCase(), end: m.index + m[0].length }));

/** An item's name without the leading words it shares with its rev's: "TOW - Speed Plugs" under "TOW" reads "Speed
 *  Plugs", "HOW Beam Pockets" under "HOW - Cavity" "Beam Pockets". Nothing shared, or nothing left: the whole name. */
export function shortItem(item: string, rev: string): string {
  const full = item.trim();
  const mine = words(full);
  const its = words(rev);
  let k = 0;
  while (k < mine.length && k < its.length && mine[k]?.w === its[k]?.w) k += 1;
  const cut = mine[k - 1];
  if (k === 0 || !cut) return full;
  const rest = full.slice(cut.end).replace(LEAD_SEP, '').trim();
  return rest === '' ? full : rest;
}

export interface ItemChip {
  item: RevItem;
  status: CellStatus;
  /** What the chip says: the item's short name. */
  short: string;
  /** Passed: the OFS IR number that passed it, when known. */
  ofsNumber: number | null;
  /** Signed off before the app with its OFS IR on file: that file. */
  fileId: string | null;
}

export interface ItemLine {
  rev: Rev;
  /** The rev written out: "Rev 1 · HOW - Cavity". */
  label: string;
  chips: ItemChip[];
}

/** The wall's revs in its list's order, each with its items' chips; revs with no items left out. */
export function itemLines(setup: RevSetup, index: StatusIndex, area: RevArea, files: SignoffFiles): ItemLine[] {
  return wallRevs(setup, index, area)
    .filter((r) => r.cells.length > 0)
    .map(({ rev, cells }) => ({
      rev,
      label: revLabel(rev),
      chips: cells.map(({ item, cell }) => {
        const passed = cell.status === 'passed';
        return {
          item,
          status: cell.status,
          short: shortItem(item.name, rev.name),
          ofsNumber: passed ? cell.ofs_number : null,
          fileId: signedBefore(cell) ? (files.get(`${area.id}:${item.id}`) ?? null) : null,
        };
      }),
    }));
}

const ofs = (n: number) => String(n).padStart(4, '0');

/** "Stuff · 0042" when passed with its OFS number, else "Stuff". */
export function itemChipText(chip: ItemChip): string {
  return chip.ofsNumber !== null ? `${chip.short} · ${ofs(chip.ofsNumber)}` : chip.short;
}

/** Its whole name, spoken and on hover: "HOW Cavity Stuff: Passed, OFS 0042". */
export function itemChipName(chip: ItemChip): string {
  const said = `${chip.item.name}: ${chipOf(chip.status).label}`;
  return chip.ofsNumber !== null ? `${said}, OFS ${ofs(chip.ofsNumber)}` : said;
}
