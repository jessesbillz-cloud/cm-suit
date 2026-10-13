// The spec section a document's own words give it, when its name has none (Jesse, Oct 12: "Even on creation we could
// look through, determine the section ... hidden if we had to"; RFIs: "we'd have to read those"). The text is a file's
// first pages as pdf.js reads them, a line per line. No AI: a CSI number right after a label ("Spec Section:",
// "Specification Section No.", "SECTION 09 29 00", "Spec 092900", "Reference: 09 29 00"), or the label at the end of the
// line before it (a form's label cell). A number on a line that starts with a label counts for less. A number with no
// label counts only when the job's spec book has it and it is the only such one. A section the book has wins, then the
// stronger label, then the earlier one.
import { findSection, sectionDigits } from './sections';

/** 6 digits or 3 pairs (with a ".13" kept off), never part of a longer number or a decimal. */
const NUMBER = /(?<![\d.])(?:\d{2} \d{2} \d{2}|\d{6})(?:\.\d{1,2})?(?![\d])/g;

const L_SPEC_SECTION = 'spec(?:ification)?\\.?\\s*section';
const L_SECTION = 'section';
const L_SPEC = 'spec(?:ification)?s?\\.?';
const L_REF = 'ref(?:erence)?s?\\.?';

/** A label ending right where the number starts ("Spec Section No.: "). Its group says how strong it is. */
const LABEL_END = new RegExp(
  `(?:^|[^a-z])(?:(${L_SPEC_SECTION})|(${L_SECTION})|(${L_SPEC})|(${L_REF}))(?:\\s*(?:no\\.?|number|#))?\\s*[:#–-]?\\s*$`,
  'i',
);
/** A line that starts with a label ("Reference: A-501, 09 29 00"). */
const LABEL_START = new RegExp(`^\\s*(?:${L_SPEC_SECTION}|${L_SECTION}|${L_SPEC}|${L_REF})(?![a-z])`, 'i');

/** Spec Section 3, Section or Spec 2, Reference 1. */
const strength = (m: RegExpExecArray) => (m[1] ? 3 : m[2] || m[3] ? 2 : 1);

/** How strongly the words before a number say it is the section: 3 to 0. */
function weightOf(before: string, lineBefore: string | undefined): number {
  const m = LABEL_END.exec(before.slice(-48));
  if (m) return strength(m);
  const prev = before.trim() === '' && lineBefore !== undefined ? LABEL_END.exec(lineBefore.slice(-48)) : null;
  if (prev) return strength(prev);
  return LABEL_START.test(before) ? 1 : 0;
}

interface Found {
  /** "092900". */
  key: string;
  weight: number;
  inBook: boolean;
  at: number;
}

const spaced = (key: string) => `${key.slice(0, 2)} ${key.slice(2, 4)} ${key.slice(4, 6)}`;

/** The section the text names, "09 29 00", else null. `book`: the job's spec book's sections, to prefer. */
export function sectionOfText(text: string, book: readonly { section: string }[] = []): string | null {
  const lines = text.replace(/[\t\u00a0 ]+/g, ' ').split(/\r?\n/);
  const found: Found[] = [];
  lines.forEach((line, n) => {
    for (const m of line.matchAll(NUMBER)) {
      const digits = sectionDigits(m[0].replace(/ /g, ''));
      if (digits === null) continue;
      const key = digits.slice(0, 6);
      const weight = weightOf(line.slice(0, m.index), n > 0 ? lines[n - 1] : undefined);
      found.push({ key, weight, inBook: findSection(book, key) !== null, at: found.length });
    }
  });
  const labeled = found.filter((f) => f.weight > 0);
  if (labeled.length > 0) {
    const best = labeled.sort((a, b) => Number(b.inBook) - Number(a.inBook) || b.weight - a.weight || a.at - b.at)[0];
    return best ? spaced(best.key) : null;
  }
  const known = [...new Set(found.filter((f) => f.inBook).map((f) => f.key))];
  const only = known.length === 1 ? known[0] : undefined;
  return only === undefined ? null : spaced(only);
}
