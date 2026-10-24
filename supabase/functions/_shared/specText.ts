// A spec section's words as structure (0118, Jesse, Oct 23: "rebuild it on the site"): PART headings, articles
// (1.01), paragraphs by their labels (A., 1., a., 1), a), (1), (a)) and plain lines. Deterministic, no AI. Pure, so
// the spec-text function, its tests and the app's e2e mock all run the same code.
//
// Reading a section's pages (pdf.js text, one line per text line):
//   1. Page furniture goes: at the top and bottom 4 lines of a page, a line that repeats on many pages of the book
//      (`running`, from spec_text_running, a project name), a footer with the section number and page ("09 29 00 - 3"),
//      a page number, a SECTION or DIVISION header, the section's own title. A heading or a label is never furniture.
//   2. Before PART 1, the SECTION line and the title lines go (the reader shows them). END OF SECTION ends it.
//   3. Every other line starts a block when it is a PART, an article of that part, or a paragraph label that fits the
//      outline (the next letter or number at an open level, or the first one a level deeper). Anything else continues
//      the block before it (a line ending in a hyphen joins the next with no space).
//   A section whose pages hold almost no text is a scan: 'no_text' (no OCR).

/** Bumped when the parsing changes: every section is parsed again (spec_text_todo compares it). */
export const SPEC_PARSER = 1;

export type SpecBlock =
  | { k: 'part'; n: string; t: string }
  | { k: 'article'; n: string; t: string }
  | { k: 'para'; n: string; d: number; t: string }
  | { k: 'text'; t: string };

export interface ParsedSection {
  status: 'done' | 'no_text';
  body: SpecBlock[];
}

export interface SectionSource {
  section: string;
  title: string;
  pages: readonly { page: number; text: string }[];
}

/** spec_text_running's answer: how many pages the book has, and the edge lines on 3 pages or more. */
export interface RunningLines {
  pages: number;
  lines: Readonly<Record<string, number>>;
}

const EDGE = 4;
const MAX_BLOCK = 20_000;
const MAX_BLOCKS = 5_000;
const MIN_TEXT = 20;

/** The same reading as spec_text_running: spaces as one, trimmed, every run of digits as '#'. */
export function normLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/[0-9]+/g, '#');
}

/** The lines that are page furniture: on at least 3 pages and a fifth of the book. */
export function runningSet(r: RunningLines): Set<string> {
  const min = Math.max(3, Math.ceil(r.pages * 0.2));
  return new Set(Object.entries(r.lines).filter(([, n]) => n >= min).map(([l]) => l));
}

/** Control characters out (pdf.js leaves some), spaces as one. */
function clean(s: string): string {
  let out = '';
  for (const ch of s) out += ch.charCodeAt(0) < 32 ? ' ' : ch;
  return out.replace(/\s+/g, ' ').trim();
}

const PART = /^PART\s+(\d{1,2})\b\s*[-–—:.]*\s*(.*)$/;
const ARTICLE = /^(?:ARTICLE\s+)?(\d{1,2})\.(\d{1,2})\.?(?:\s+(\S.*))?$/;
const END = /^END\s+OF\s+(SECTION|DOCUMENT)\b/i;
const FOOTER = /(^|\s)\d{2}\s?\d{2}\s?\d{2}(\.\d{1,2})?\s*[-–—]\s*(page\s+)?\d{1,4}(\s+of\s+\d{1,4})?(\s|$)/i;
const PAGE_NO = /^(page\s+)?\d{1,4}(\s+of\s+\d{1,4})?$/i;
const HEADER = /^(SECTION|DOCUMENT)\s+\d{2}\s?\d{2}\s?\d{2}/i;
const DIVISION = /^DIVISION\s+\d{1,2}\b/i;

interface Label {
  d: number;
  n: string;
  rest: string;
}

/** The kinds of paragraph label by level: A. / 1. / a. / 1) or (1) / a) or (a). */
const LABELS: readonly { d: number; re: RegExp }[] = [
  { d: 1, re: /^([A-Z])\.(?:\s+(.*))?$/ },
  { d: 2, re: /^(\d{1,2})\.(?:\s+(.*))?$/ },
  { d: 3, re: /^([a-z])\.(?:\s+(.*))?$/ },
  { d: 4, re: /^\(?(\d{1,2})\)(?:\s+(.*))?$/ },
  { d: 5, re: /^\(?([a-z])\)(?:\s+(.*))?$/ },
];

function labelOf(line: string): Label | null {
  for (const { d, re } of LABELS) {
    const m = re.exec(line);
    if (m?.[1] !== undefined) return { d, n: m[1], rest: (m[2] ?? '').trim() };
  }
  return null;
}

const FIRST: Record<number, string> = { 1: 'A', 2: '1', 3: 'a', 4: '1', 5: 'a' };

function nextOf(n: string): string {
  return /^\d+$/.test(n) ? String(Number(n) + 1) : String.fromCharCode(n.charCodeAt(0) + 1);
}

/** A heading or a label: never page furniture, never a continuation. */
function structural(line: string): boolean {
  return PART.test(line) || ARTICLE.test(line) || END.test(line) || labelOf(line) !== null;
}

const upperKey = (s: string) => clean(s).toUpperCase();

/** The section's lines with the page furniture taken out, pages in order. */
function bodyLines(src: SectionSource, running: ReadonlySet<string>): string[] {
  const title = upperKey(src.title);
  const out: string[] = [];
  for (const p of src.pages) {
    const lines = p.text.split(/\r?\n/).map(clean);
    const filled = lines.map((l, i) => (l === '' ? -1 : i)).filter((i) => i >= 0);
    const edge = new Set([...filled.slice(0, EDGE), ...filled.slice(-EDGE)]);
    lines.forEach((line, i) => {
      if (edge.has(i) && !structural(line)) {
        const key = upperKey(line);
        if (running.has(normLine(line)) || FOOTER.test(line) || PAGE_NO.test(line) || HEADER.test(line) || DIVISION.test(line)) return;
        if (title !== '' && key === title) return;
      }
      out.push(line);
    });
  }
  return out;
}

interface Outline {
  part: number | null;
  /** The last article's number in this part (1.03 is 3). */
  article: number;
  /** The last label at each level (index = level), cut back when a shallower one comes. */
  last: (string | undefined)[];
  depth: number;
}

/** The label fits the outline: the next one at an open level, or the first one deeper than where we are. */
function fits(o: Outline, l: Label): boolean {
  const prev = o.last[l.d];
  if (l.d <= o.depth && prev !== undefined && nextOf(prev) === l.n) return true;
  return l.d > o.depth && l.n === FIRST[l.d];
}

/** An article of the part we are in, numbered just after the last one (a measure like "1.5 inches" is not one). */
function articleFits(o: Outline, major: number, minor: number): boolean {
  return (o.part === null || major === o.part) && minor > o.article && minor <= o.article + 3;
}

function take(o: Outline, l: Label): void {
  o.last[l.d] = l.n;
  o.last.length = l.d + 1;
  o.depth = l.d;
}

function joined(a: string, b: string): string {
  if (a === '') return b;
  // Specs are set ragged right: a line ending in a hyphen is a compound (non-load-bearing), kept whole.
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a + b;
  return `${a} ${b}`;
}

const hasLower = (s: string) => /[a-z]/.test(s);

/** One section's pages as blocks. */
export function parseSection(src: SectionSource, running: ReadonlySet<string> = new Set()): ParsedSection {
  const letters = src.pages.reduce((n, p) => n + (p.text.match(/[A-Za-z0-9]/g)?.length ?? 0), 0);
  if (letters < MIN_TEXT) return { status: 'no_text', body: [] };

  const lines = bodyLines(src, running);
  const blocks: SpecBlock[] = [];
  const o: Outline = { part: null, article: 0, last: [], depth: 0 };
  const title = upperKey(src.title);
  let started = false;
  let gap = false;

  for (const line of lines) {
    if (line === '') {
      gap = true;
      continue;
    }
    if (END.test(line)) break;
    const part = PART.exec(line);
    if (part?.[1] !== undefined) {
      started = true;
      o.part = Number(part[1]);
      o.article = 0;
      o.last = [];
      o.depth = 0;
      blocks.push({ k: 'part', n: part[1], t: (part[2] ?? '').trim() });
      gap = false;
      continue;
    }
    if (!started && (HEADER.test(line) || upperKey(line) === title || (title !== '' && title.includes(upperKey(line)) && !hasLower(line)))) continue;
    const art = ARTICLE.exec(line);
    if (art?.[1] !== undefined && art[2] !== undefined && articleFits(o, Number(art[1]), Number(art[2]))) {
      o.article = Number(art[2]);
      o.last = [];
      o.depth = 0;
      blocks.push({ k: 'article', n: `${art[1]}.${art[2]}`, t: (art[3] ?? '').trim() });
      gap = false;
      continue;
    }
    const label = labelOf(line);
    if (label && fits(o, label)) {
      take(o, label);
      blocks.push({ k: 'para', n: label.n, d: label.d, t: label.rest });
      gap = false;
      continue;
    }
    const prev = blocks[blocks.length - 1];
    if (prev === undefined) {
      blocks.push({ k: 'text', t: line });
    } else if (prev.k === 'part' || prev.k === 'article') {
      // A heading takes the next line only as its own title (or the rest of a capitals title).
      if (prev.t === '' || (!hasLower(line) && !hasLower(prev.t) && !gap)) prev.t = joined(prev.t, line);
      else blocks.push({ k: 'text', t: line });
    } else if (gap && /[.:;]$/.test(prev.t)) {
      blocks.push({ k: 'text', t: line });
    } else {
      prev.t = joined(prev.t, line);
    }
    gap = false;
    if (blocks.length >= MAX_BLOCKS) break;
  }
  for (const b of blocks) if (b.t.length > MAX_BLOCK) b.t = b.t.slice(0, MAX_BLOCK);
  return { status: 'done', body: blocks };
}
