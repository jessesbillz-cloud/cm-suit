// Finding a section in a spec book (Jesse, Oct 12: "type in the numbers, and clickable boxes on the left populate with
// which section you want to go to ... it kind of cascades open"). Numbers match by their digits, spaces and dots
// ignored ("0929", "09 29", "092900" all find 09 29 00); words match the section's title or its division's. The sections
// come back by division, in book order, each with its place in the book. `first` is where Enter goes: the first section
// whose number starts with what was typed, else the first that matches.
import type { SpecBookSection } from '../../data/specs';

interface FoundSection {
  /** Its place in the book's sections. */
  index: number;
  section: string;
  title: string;
  first_page: number;
}

export interface DivisionGroup {
  /** "09". */
  division: string;
  /** "Finishes"; empty when not known. */
  title: string;
  sections: FoundSection[];
}

interface Found {
  groups: DivisionGroup[];
  first: FoundSection | null;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');
const NUMBER = /^[\d\s.]+$/;

export function findSections(
  sections: readonly Pick<SpecBookSection, 'section' | 'title' | 'first_page'>[],
  query: string,
  divisionTitle: (division: string) => string | null = () => null,
): Found {
  const q = query.trim().toLowerCase();
  const number = NUMBER.test(q) ? digitsOf(q) : '';
  const tokens = q === '' || number !== '' ? [] : q.split(/\s+/);
  const groups: DivisionGroup[] = [];
  let prefix: FoundSection | null = null;
  let match: FoundSection | null = null;

  for (const [index, s] of sections.entries()) {
    const digits = digitsOf(s.section);
    const division = digits.slice(0, 2);
    const divTitle = divisionTitle(division) ?? '';
    const words = `${s.title} ${divTitle}`.toLowerCase();
    const hit =
      number !== ''
        ? digits.includes(number)
        : tokens.every((t) => (NUMBER.test(t) ? digits.includes(digitsOf(t)) : words.includes(t)));
    if (!hit) continue;
    const found: FoundSection = { index, section: s.section, title: s.title, first_page: s.first_page };
    match ??= found;
    if (number !== '' && prefix === null && digits.startsWith(number)) prefix = found;
    let group = groups.find((g) => g.division === division);
    if (!group) {
      group = { division, title: divTitle, sections: [] };
      groups.push(group);
    }
    group.sections.push(found);
  }

  return { groups, first: q === '' ? null : (prefix ?? match) };
}
