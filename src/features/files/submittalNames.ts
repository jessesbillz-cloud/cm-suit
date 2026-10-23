// The naming rule for Submittals (Jesse, Oct 12: "implement hard naming conventions on the files; if they want to
// change it with their own company names, fine, as long as the spec number is in the title"): a file that lands in
// Submittals with no section in its name is asked for one before it goes up, and goes up as "<section>_<their name>",
// their own words kept. Only Submittals; a dropped folder that names a section ("092000 - Framing - Sample Co") offers it.
import { sectionKey, sectionOfName } from '../specs/sections';
import { sortDrop, type SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';

export interface Unnamed {
  /** Its place in the drop. */
  at: number;
  name: string;
  /** The section its dropped folders name ("092000"), else "". */
  offered: string;
}

/** The files of a drop that land in Submittals with no section in their names, in drop order. */
export function unnamedSubmittals(dropped: readonly DroppedFile[], viewing: SectionKind, ccds: boolean): Unnamed[] {
  const going = new Set<DroppedFile>();
  for (const g of sortDrop(dropped, viewing, ccds)) {
    if ((g.kind ?? viewing) === 'submittals') for (const d of g.items) going.add(d);
  }
  return dropped.flatMap((d, at) => {
    if (!going.has(d) || sectionOfName(d.file.name) !== null) return [];
    const named = [...d.dir].reverse().map(sectionOfName).find((s) => s !== null);
    return [{ at, name: d.file.name, offered: named ? (sectionKey(named) ?? '') : '' }];
  });
}

/** What was typed as a section's 6 digits ("092900", "09 29 00"); null when it is not one. */
export function typedSection(text: string): string | null {
  const t = text.trim();
  return /^\d{2} ?\d{2} ?\d{2}$/.test(t) ? sectionKey(t) : null;
}

/** The name with its section in front: "092900_Gypsum board shop drawings.pdf". */
export const sectionedName = (key: string, name: string) => `${key}_${name}`;

/** The drop with each asked file renamed with its section (the bytes are the same file's). */
export function applySections(dropped: readonly DroppedFile[], keys: ReadonlyMap<number, string>): DroppedFile[] {
  return dropped.map((d, at) => {
    const key = keys.get(at);
    if (key === undefined) return d;
    const file = new File([d.file], sectionedName(key, d.file.name), { type: d.file.type, lastModified: d.file.lastModified });
    return { ...d, file };
  });
}
