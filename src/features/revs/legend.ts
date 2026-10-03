// A pasted rev legend, as OSFM writes it, into what rev_list_create takes. A line starting "Rev 0", "Rev. 1 -",
// "Rev 2 –" or "Rev 3:" starts a rev (its name after the number); the lines under it are its items, each with its
// company in parentheses at the end when there is one: "HOW Cavity Stuff (Firestop sub)". Blank lines are ignored;
// items may also follow the rev's name after a colon, or share a line split by semicolons. Anything that doesn't fit
// is refused with a short message naming the line. The database checks the same limits again (rev_legend_check).
import type { LegendRev } from '../../data/revs.types';

type LegendResult = { ok: true; revs: LegendRev[] } | { ok: false; error: string };

const MAX_REVS = 50;
const MAX_ITEMS = 50;
const REV_NAME_MAX = 80;
const ITEM_NAME_MAX = 120;
const COMPANY_MAX = 120;

/** "Rev. 0 - TOW", "Rev 1 – HOW - Cavity", "REV 3: Drywall", "Revision 4 In-Wall". */
const REV_LINE = /^rev(?:ision)?\.?\s*#?\s*(\d{1,6})(?!\d)\s*[-–—:.)]?\s*(.*)$/i;
/** A bullet or a list number in front of an item. */
const BULLET = /^(?:[-–—•*·]|\d{1,2}[.)])\s+/;
/** The company in parentheses at the end. */
const COMPANY = /^(.*?)\s*\(([^()]*)\)$/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Parsed {
  line: number;
  rev: LegendRev;
}

function fail(line: number, message: string): LegendResult {
  return { ok: false, error: `Line ${String(line)}: ${message}` };
}

/** One item ("name (company)"), or the reason it isn't one. */
function parseItem(text: string): { name: string; company: string | null } | string {
  const m = COMPANY.exec(text);
  const name = clean(m ? (m[1] ?? '') : text);
  const company = m ? clean(m[2] ?? '') : '';
  if (name === '') return 'name the item.';
  if (name.length > ITEM_NAME_MAX) return `keep item names to ${String(ITEM_NAME_MAX)} characters.`;
  if (company.length > COMPANY_MAX) return `keep the company to ${String(COMPANY_MAX)} characters.`;
  return { name, company: company === '' ? null : company };
}

/** Adds the items on a line (split by semicolons) to the rev; the reason when one doesn't fit. */
function addItems(into: Parsed, text: string): string | null {
  for (const part of text.split(';').map((p) => clean(p.replace(BULLET, ''))).filter((p) => p !== '')) {
    const item = parseItem(part);
    if (typeof item === 'string') return item;
    if (into.rev.items.some((i) => i.name.toLowerCase() === item.name.toLowerCase())) {
      return `"${item.name}" is in Rev ${String(into.rev.number)} twice.`;
    }
    if (into.rev.items.length >= MAX_ITEMS) return `up to ${String(MAX_ITEMS)} items in a rev.`;
    into.rev.items.push(item);
  }
  return null;
}

export function parseLegend(text: string): LegendResult {
  const lines = text.split(/\r?\n/);
  const out: Parsed[] = [];
  for (const [i, raw] of lines.entries()) {
    const line = i + 1;
    const t = clean(raw);
    if (t === '') continue;
    const head = REV_LINE.exec(t);
    if (head) {
      const number = Number(head[1]);
      const rest = head[2] ?? '';
      const colon = rest.indexOf(':');
      const name = clean(colon < 0 ? rest : rest.slice(0, colon));
      if (name === '') return fail(line, 'name the rev.');
      if (name.length > REV_NAME_MAX) return fail(line, `keep rev names to ${String(REV_NAME_MAX)} characters.`);
      if (out.some((p) => p.rev.number === number)) return fail(line, `Rev ${String(number)} is in twice.`);
      if (out.length >= MAX_REVS) return fail(line, `up to ${String(MAX_REVS)} revs.`);
      const parsed: Parsed = { line, rev: { number, name, items: [] } };
      out.push(parsed);
      if (colon >= 0) {
        const why = addItems(parsed, rest.slice(colon + 1));
        if (why !== null) return fail(line, why);
      }
      continue;
    }
    const current = out[out.length - 1];
    if (!current) {
      // A "Legend" title above the first rev is fine.
      if (/^legend:?$/i.test(t)) continue;
      return fail(line, 'start with a rev, like "Rev 0 - TOW".');
    }
    const why = addItems(current, t);
    if (why !== null) return fail(line, why);
  }
  if (out.length === 0) return { ok: false, error: 'Paste the legend.' };
  const empty = out.find((p) => p.rev.items.length === 0);
  if (empty) return fail(empty.line, `Rev ${String(empty.rev.number)} has no items.`);
  return { ok: true, revs: out.map((p) => p.rev) };
}
