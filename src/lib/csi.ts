// CSI MasterFormat helpers (SPEC §11.2): find sections by number or title, and show a list of section numbers in one
// short line. Numbers are 'NN NN NN' (Level 4 adds '.NN'); typed digits match however they are spaced.

interface SectionLike {
  number: string;
  division: string;
  title: string;
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

function wordsOf(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== '');
}

/** Whether the typed digits appear in the number starting on a pair ("2116" is in 092116; "21" is not in 092216). */
function hasPairs(number: string, typed: string): boolean {
  for (let i = 0; i + typed.length <= number.length; i += 2) {
    if (number.startsWith(typed, i)) return true;
  }
  return false;
}

/** How well a section answers the query: lower is better, null is no match. */
function rank(section: SectionLike, query: string): number | null {
  const number = digitsOf(section.number);
  if (/^[\d\s.]+$/.test(query)) {
    const typed = digitsOf(query);
    if (number.startsWith(typed)) return 0;
    return hasPairs(number, typed) ? 1 : null;
  }
  const title = section.title.toLowerCase();
  const words = wordsOf(section.title);
  const everyTokenFits = wordsOf(query).every((t) => (/^\d+$/.test(t) ? hasPairs(number, t) : words.some((w) => w.startsWith(t))));
  if (everyTokenFits) return 2;
  return title.includes(query) ? 3 : null;
}

/**
 * Sections for a query, best match first, then by number: the number starting with the typed digits ("0921",
 * "09 21"), then containing them, then titles whose words start with the typed words ("gyp bo"), then titles
 * containing the text. `division` limits the search to one division; null searches all. An empty query lists the
 * sections in scope in number order.
 */
export function searchSections<T extends SectionLike>(sections: readonly T[], query: string, division: string | null): T[] {
  const inScope = division === null ? [...sections] : sections.filter((s) => s.division === division);
  const q = query.trim().toLowerCase();
  if (q === '') return inScope.sort((a, b) => a.number.localeCompare(b.number));
  return inScope
    .map((s) => ({ s, r: rank(s, q) }))
    .filter((x): x is { s: T; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.s.number.localeCompare(b.s.number))
    .map((x) => x.s);
}

/** A package's sections in one quiet line: "09 21 16 · 09 22 16 · 09 29 00 +2". Empty when there are none. */
export function sectionsLine(numbers: readonly string[], max = 4): string {
  const shown = numbers.slice(0, max).join(' · ');
  return numbers.length > max ? `${shown} +${String(numbers.length - max)}` : shown;
}
