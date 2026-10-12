// What a row shows, by its section: a plan's sheet, a submittal's section, number, stamp and company, else its name.
import type { SectionKind } from './classify';
import { parseSheet, parseSubmittal, type Sheet, type Submittal } from './fileNames';

export type RowView =
  | { kind: 'plain' }
  | { kind: 'sheet'; sheet: Sheet | null }
  | { kind: 'submittal'; sub: Submittal | null; company: string };

export function rowView(section: SectionKind, name: string, company: string): RowView {
  if (section === 'plans') return { kind: 'sheet', sheet: parseSheet(name) };
  if (section === 'submittals') return { kind: 'submittal', sub: parseSubmittal(name), company };
  return { kind: 'plain' };
}
