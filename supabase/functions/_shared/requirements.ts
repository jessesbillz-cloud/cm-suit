// requirements-extract's pure parts (migration 0063): the request, one section's page text with its page lines, and
// the AI's candidates made into drafts. A candidate whose quote is not in the text is left out (evidence or nothing);
// its page comes from the text's own page lines, not the model's word; dollar figures never reach the drafts (CLAUDE.md
// rule 3: money lives only in pricing tables); the section is spaced like the database keeps it ("102800" ->
// "10 28 00"); text is cut to the columns' lengths; a repeat inside one answer is dropped. Tests: requirements_test.ts.
import { uuid, z } from './validate.ts';
import type { ExtractRequirementsResult } from './ai.ts';

/** One read is one section: a spec section runs a few pages, never 40. */
export const MAX_PAGES = 40;
/** ~50k tokens of section text. */
export const MAX_CHARS = 200_000;

export const ExtractBody = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('file'),
    project_id: uuid,
    file_id: uuid,
    first_page: z.number().int().min(1).max(100_000),
    last_page: z.number().int().min(1).max(100_000),
  }).strict(),
  z.object({ source: z.literal('text'), project_id: uuid, text: z.string().trim().min(40).max(MAX_CHARS) }).strict(),
]);
export type ExtractRequest = z.output<typeof ExtractBody>;

/** Why a page range can't be read in one go, or null. */
export function pageRangeProblem(first: number, last: number): string | null {
  if (last < first) return 'The last page comes before the first.';
  if (last - first + 1 > MAX_PAGES) return `Read up to ${MAX_PAGES} pages at a time (one section).`;
  return null;
}

export interface PageText {
  page_no: number;
  text: string;
}

/** The pages as one text, each after its `--- page N ---` line (what the prompt reads and the page lookup uses). */
export function pagesText(pages: readonly PageText[]): string {
  return pages.map((p) => `--- page ${p.page_no} ---\n${p.text}`).join('\n\n');
}

/** For matching a quote: the XML escaping undone, typographic quotes and dashes plain, whitespace collapsed, lowercase. */
export function normalizeQuote(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const PAGE_LINE = /^--- page (\d+) ---$/gm;

/** The page whose text holds the quote, from the text's own page lines; null when there are none or it spans two. */
export function pageOf(quote: string, docText: string): number | null {
  const marks = [...docText.matchAll(PAGE_LINE)];
  const q = normalizeQuote(quote);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? docText.length) : docText.length;
    if (normalizeQuote(docText.slice(start, end)).includes(q)) return Number(m[1]);
  }
  return null;
}

const MONEY = /(?:\$|USD\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|mm|million|thousand)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|usd)\b/gi;

/** Dollar figures become "[amount]". */
export function redactMoney(s: string): string {
  return s.replace(MONEY, '[amount]');
}

/** "102800" -> "10 28 00", "102800.13" -> "10 28 00.13"; anything the database would refuse becomes "". */
export function cleanSection(s: string): string {
  const v = s.replace(/\s+/g, ' ').trim();
  const spaced = /^\d{6}(\.\d{1,2})?$/.test(v) ? `${v.slice(0, 2)} ${v.slice(2, 4)} ${v.slice(4)}` : v;
  return /^[0-9A-Za-z .-]{0,20}$/.test(spaced) ? spaced : '';
}

function words(s: string, max: number): string {
  return redactMoney(s.replace(/\s+/g, ' ').trim()).slice(0, max).trim();
}

/** One draft as requirements_add_drafts takes it. */
export interface Draft {
  kind: string;
  title: string;
  details: string;
  spec_section: string;
  spec_title: string;
  spec_ref: string;
  responsible: string;
  required: string;
  notice_days: number | null;
  lead_days: number | null;
  activity_name: string;
  quote: string;
  page: number | null;
}

export interface Prepared {
  drafts: Draft[];
  /** Left out: the quote is not in the text. */
  unquoted: number;
  /** Left out: the same item twice in one answer. */
  repeated: number;
}

export function prepareDrafts(result: ExtractRequirementsResult, docText: string): Prepared {
  const doc = normalizeQuote(docText);
  const seen = new Set<string>();
  const drafts: Draft[] = [];
  let unquoted = 0;
  let repeated = 0;
  for (const c of result.requirements) {
    const quote = c.evidence.quote;
    if (!doc.includes(normalizeQuote(quote))) {
      unquoted++;
      continue;
    }
    const title = words(c.title, 200);
    const section = cleanSection(c.spec_section);
    const keys = [`${c.kind}|${section}|${title.toLowerCase()}`, `${c.kind}|q|${normalizeQuote(quote)}`];
    if (title === '' || keys.some((k) => seen.has(k))) {
      repeated++;
      continue;
    }
    for (const k of keys) seen.add(k);
    drafts.push({
      kind: c.kind,
      title,
      details: words(c.details, 2000),
      spec_section: section,
      spec_title: words(c.spec_title, 120),
      spec_ref: words(c.spec_ref, 40),
      responsible: words(c.responsible, 120),
      required: c.required,
      notice_days: c.notice_days,
      lead_days: c.lead_days,
      activity_name: words(c.trigger, 160),
      quote: words(quote, 600),
      page: pageOf(quote, docText),
    });
  }
  return { drafts, unquoted, repeated };
}
