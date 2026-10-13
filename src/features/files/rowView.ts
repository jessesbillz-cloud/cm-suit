// What a row shows, by its section: a plan's sheet, a submittal's section, number, stamp and company, else its name. A
// submittal whose name says no section shows the one it is filed under (its hidden spec section, 0105), its name as title.
import type { SectionKind } from './classify';
import { parseSheet, parseSubmittal, stripExt, type Sheet, type Submittal } from './fileNames';

/**
 * How a submittal's stamp reads: its codes (the design team), Approved or Not approved (a reader whose job is approve
 * or not, Jesse, Oct 12), or nothing while that is not known yet.
 */
export type StampMode = 'codes' | 'outcome' | 'unknown';

export type RowView =
  | { kind: 'plain' }
  | { kind: 'sheet'; sheet: Sheet | null }
  | { kind: 'submittal'; sub: Submittal | null; company: string; stamps: StampMode };

/** "092900" as a submittal with only its section. */
function filedUnder(stored: string, name: string): Submittal {
  return { section: `${stored.slice(0, 2)} ${stored.slice(2, 4)} ${stored.slice(4, 6)}`, no: null, title: stripExt(name), stamp: null };
}

export function rowView(
  section: SectionKind,
  name: string,
  company: string,
  stamps: StampMode = 'codes',
  stored: string | null = null,
): RowView {
  if (section === 'plans') return { kind: 'sheet', sheet: parseSheet(name) };
  if (section === 'submittals') {
    const sub = parseSubmittal(name) ?? (stored === null ? null : filedUnder(stored, name));
    return { kind: 'submittal', sub, company, stamps };
  }
  return { kind: 'plain' };
}
