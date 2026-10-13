// Spec section numbers wherever people write them ("09 21 16", "092116", "09 21 16.13"), and where the reader is in a
// spec book's sections. Numbers are compared by their digits, so spacing never matters.
import type { SpecBook, SpecBookSection } from '../../data/specs';
import { parseSubmittal, stripExt } from '../files/fileNames';

/** "09 21 16.13" -> "09211613"; null when it is not a section number (Divisions 00 to 49). */
export function sectionDigits(s: string): string | null {
  const m = /^\s*(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s*$/.exec(s);
  if (!m?.[1] || !m[2] || !m[3] || Number(m[1]) > 49) return null;
  return `${m[1]}${m[2]}${m[3]}${m[4] ?? ''}`;
}

/** The section a link means: the same number, else its Level 3 parent or a Level 4 child. */
export function findSection<T extends Pick<SpecBookSection, 'section'>>(sections: readonly T[], wanted: string): T | null {
  const want = sectionDigits(wanted);
  if (want === null) return null;
  const digits = sections.map((s) => sectionDigits(s.section));
  const exact = sections.find((_, i) => digits[i] === want);
  if (exact) return exact;
  return sections.find((_, i) => {
    const d = digits[i];
    return d != null && (want.startsWith(d) || d.startsWith(want));
  }) ?? null;
}

/** A section number in a name: 6 digits or 3 pairs with single spaces ("2026 10" is not one), never part of a longer number. */
const IN_NAME = /(?<!\d)(?:\d{2} \d{2} \d{2}|\d{6})(?!\d)/g;

/**
 * The spec section a file's name carries, "09 29 00", else null. The one reading of it (Jesse, Oct 12: "as long as the
 * spec number is in the title"): a submittal's own forms at the start ("092900_04.0_Gypsum Board_NET.pdf",
 * "S-0147.0-079200-Joint Sealants"), else the first section number anywhere in it ("RFI 012 - 09 29 00 Board.pdf",
 * "Sample Co 092900 shop drawings.pdf").
 */
export function sectionOfName(name: string): string | null {
  const start = parseSubmittal(name)?.section;
  if (start !== undefined) return start;
  for (const m of stripExt(name).matchAll(IN_NAME)) {
    const digits = sectionDigits(m[0].replace(/ /g, ''));
    if (digits !== null) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  }
  return null;
}

/** "09 29 00", "092900" or "09 29 00.13" as the 6 digits a section is filed under; null when not a section number. */
export function sectionKey(s: string): string | null {
  return sectionDigits(s)?.slice(0, 6) ?? null;
}

/**
 * The 6 digits a file is filed under: its spec section (0105, found when it went up, or from its name since), else its
 * name's. Null when neither has one.
 */
export function fileSectionKey(f: { original_name: string; spec_section?: string | null | undefined }): string | null {
  if (f.spec_section != null) return f.spec_section;
  const named = sectionOfName(f.original_name);
  return named === null ? null : sectionKey(named);
}

/** The newest book (the books come oldest first) that has the section, and the section in it; null when none has it. */
export function bookWith(books: readonly SpecBook[], wanted: string): { book: SpecBook; section: SpecBookSection } | null {
  for (const book of [...books].reverse()) {
    const section = findSection(book.sections, wanted);
    if (section) return { book, section };
  }
  return null;
}

/** The index of the section the page is in (the last one starting at or before it); -1 before the first. */
export function sectionAt(sections: readonly Pick<SpecBookSection, 'first_page'>[], page: number): number {
  let at = -1;
  sections.forEach((s, i) => {
    if (s.first_page <= page) at = i;
  });
  return at;
}

type RefPart = { text: string } | { section: string };

const IN_TEXT = /\b(\d{2}) ?(\d{2}) ?(\d{2})(?:\.\d{1,2})?\b/g;

/** Free text cut into words and section numbers ("Spec 09 21 16, sheet A-501"), so the numbers can be links. */
export function sectionRefs(text: string): RefPart[] {
  const parts: RefPart[] = [];
  let last = 0;
  for (const m of text.matchAll(IN_TEXT)) {
    const at = m.index;
    if (sectionDigits(m[0]) === null) continue;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ section: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
