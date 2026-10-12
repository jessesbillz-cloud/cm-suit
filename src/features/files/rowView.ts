// What a row shows, by its section: a plan's sheet, a submittal's section, number, stamp and company, else its name.
import type { SectionKind } from './classify';
import { parseSheet, parseSubmittal, type Sheet, type Submittal } from './fileNames';

/**
 * How a submittal's stamp reads: its codes (the design team), Approved or Not approved (a reader whose job is approve
 * or not, Jesse, Oct 12), or nothing while that is not known yet.
 */
export type StampMode = 'codes' | 'outcome' | 'unknown';

export type RowView =
  | { kind: 'plain' }
  | { kind: 'sheet'; sheet: Sheet | null }
  | { kind: 'submittal'; sub: Submittal | null; company: string; stamps: StampMode };

export function rowView(section: SectionKind, name: string, company: string, stamps: StampMode = 'codes'): RowView {
  if (section === 'plans') return { kind: 'sheet', sheet: parseSheet(name) };
  if (section === 'submittals') return { kind: 'submittal', sub: parseSubmittal(name), company, stamps };
  return { kind: 'plain' };
}
