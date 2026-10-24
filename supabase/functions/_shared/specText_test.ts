// `deno test supabase/functions/_shared/specText_test.ts` — a spec section's words as structure (0118), on synthetic
// section text written for this test (never a real job's).
import { normLine, parseSection, runningSet, type SpecBlock } from './specText.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const PAGE_1 = [
  'SAMPLE ELEMENTARY SCHOOL MODERNIZATION',
  'SECTION 09 29 00',
  'GYPSUM BOARD',
  'PART 1 - GENERAL',
  '1.01 SUMMARY',
  'A. Section Includes:',
  '1. Interior gypsum board.',
  '2. Tile backing panels.',
  'B. Related Requirements:',
  '1. Section 09 22 16 "Non-Structural Metal Framing" for non-',
  'load-bearing steel framing.',
  '1.02 SUBMITTALS',
  'A.',
  'Product Data: For each type of product.',
  'SAMPLE ELEMENTARY SCHOOL MODERNIZATION',
  'GYPSUM BOARD 09 29 00 - 1',
].join('\n');

const PAGE_2 = [
  'SAMPLE ELEMENTARY SCHOOL MODERNIZATION',
  'B. Samples: For each texture finish indicated, on panels 12 by',
  '12 inches.',
  'PART 2 - PRODUCTS',
  '2.01 GYPSUM BOARD, GENERAL',
  'A. Size: Provide maximum lengths and widths available.',
  '1. Thickness: 5/8 inch.',
  'a. Long edges: Tapered.',
  'b. Mold resistance: ASTM D 3273, score of 10.',
  '1) Where indicated.',
  '2. Panels are 1.5 inches from the floor where',
  '1.5 inches is shown.',
  'PART 3 - EXECUTION',
  '3.01 INSTALLATION',
  'A. Comply with ASTM C 840.',
  '',
  'END OF SECTION 09 29 00',
  'GYPSUM BOARD 09 29 00 - 2',
].join('\n');

const SOURCE = { section: '09 29 00', title: 'Gypsum Board', pages: [{ page: 4, text: PAGE_1 }, { page: 5, text: PAGE_2 }] };

const running = runningSet({ pages: 40, lines: { [normLine('SAMPLE ELEMENTARY SCHOOL MODERNIZATION')]: 40, [normLine('PART 1 - GENERAL')]: 12 } });

{
  const out = parseSection(SOURCE, running);
  check(out.status === 'done', 'a section with text is done');
  const want: SpecBlock[] = [
    { k: 'part', n: '1', t: 'GENERAL' },
    { k: 'article', n: '1.01', t: 'SUMMARY' },
    { k: 'para', n: 'A', d: 1, t: 'Section Includes:' },
    { k: 'para', n: '1', d: 2, t: 'Interior gypsum board.' },
    { k: 'para', n: '2', d: 2, t: 'Tile backing panels.' },
    { k: 'para', n: 'B', d: 1, t: 'Related Requirements:' },
    { k: 'para', n: '1', d: 2, t: 'Section 09 22 16 "Non-Structural Metal Framing" for non-load-bearing steel framing.' },
    { k: 'article', n: '1.02', t: 'SUBMITTALS' },
    { k: 'para', n: 'A', d: 1, t: 'Product Data: For each type of product.' },
    { k: 'para', n: 'B', d: 1, t: 'Samples: For each texture finish indicated, on panels 12 by 12 inches.' },
    { k: 'part', n: '2', t: 'PRODUCTS' },
    { k: 'article', n: '2.01', t: 'GYPSUM BOARD, GENERAL' },
    { k: 'para', n: 'A', d: 1, t: 'Size: Provide maximum lengths and widths available.' },
    { k: 'para', n: '1', d: 2, t: 'Thickness: 5/8 inch.' },
    { k: 'para', n: 'a', d: 3, t: 'Long edges: Tapered.' },
    { k: 'para', n: 'b', d: 3, t: 'Mold resistance: ASTM D 3273, score of 10.' },
    { k: 'para', n: '1', d: 4, t: 'Where indicated.' },
    { k: 'para', n: '2', d: 2, t: 'Panels are 1.5 inches from the floor where 1.5 inches is shown.' },
    { k: 'part', n: '3', t: 'EXECUTION' },
    { k: 'article', n: '3.01', t: 'INSTALLATION' },
    { k: 'para', n: 'A', d: 1, t: 'Comply with ASTM C 840.' },
  ];
  for (let i = 0; i < Math.max(want.length, out.body.length); i += 1) {
    check(same(out.body[i], want[i]), `block ${String(i)}: ${JSON.stringify(out.body[i])} is ${JSON.stringify(want[i])}`);
  }
}

// Without the running lines (a one-book job): the footer and the title still never show.
{
  const out = parseSection(SOURCE);
  const texts = out.body.filter((b) => b.k === 'text').map((b) => b.t);
  check(texts.every((t) => !t.includes('09 29 00 - ')), 'footers never show');
  check(!out.body.some((b) => b.t === 'GYPSUM BOARD'), 'the title never shows as text');
}

// A heading split from its title, a part with an em dash, a measure that looks like an article, an article that skips.
{
  const text = ['SECTION 10 28 00 - TOILET ACCESSORIES', 'PART 1 — GENERAL', '1.1', 'SCOPE', 'A. Work includes', 'accessories.',
    '1.5 inch grab bars are not an article.', '1.2 QUALITY ASSURANCE', 'A. Installer: Experienced.'].join('\n');
  const out = parseSection({ section: '10 28 00', title: 'Toilet Accessories', pages: [{ page: 1, text }] });
  check(same(out.body, [
    { k: 'part', n: '1', t: 'GENERAL' },
    { k: 'article', n: '1.1', t: 'SCOPE' },
    { k: 'para', n: 'A', d: 1, t: 'Work includes accessories. 1.5 inch grab bars are not an article.' },
    { k: 'article', n: '1.2', t: 'QUALITY ASSURANCE' },
    { k: 'para', n: 'A', d: 1, t: 'Installer: Experienced.' },
  ]), `split headings: ${JSON.stringify(out.body)}`);
}

// A wrapped line that starts like a label but does not follow the outline continues its paragraph.
{
  const text = ['PART 1 - GENERAL', '1.01 SUMMARY', 'A. Provide the work of Appendix', 'C. as shown.', 'B. Second item.'].join('\n');
  const out = parseSection({ section: '01 10 00', title: 'Summary', pages: [{ page: 1, text }] });
  check(same(out.body.slice(2), [
    { k: 'para', n: 'A', d: 1, t: 'Provide the work of Appendix C. as shown.' },
    { k: 'para', n: 'B', d: 1, t: 'Second item.' },
  ]), `out-of-order label: ${JSON.stringify(out.body)}`);
}

// Parenthesized labels, and text before the first part kept as plain text.
{
  const text = ['Note to specifier: sample note.', 'PART 2 - PRODUCTS', '2.01 MATERIALS', 'A. Steel:', '1. Shapes:',
    'a. Wide flange:', '(1) ASTM A 992.', '(2) Galvanized.', '(a) Hot dip.'].join('\n');
  const out = parseSection({ section: '05 12 00', title: 'Structural Steel Framing', pages: [{ page: 1, text }] });
  check(same(out.body, [
    { k: 'text', t: 'Note to specifier: sample note.' },
    { k: 'part', n: '2', t: 'PRODUCTS' },
    { k: 'article', n: '2.01', t: 'MATERIALS' },
    { k: 'para', n: 'A', d: 1, t: 'Steel:' },
    { k: 'para', n: '1', d: 2, t: 'Shapes:' },
    { k: 'para', n: 'a', d: 3, t: 'Wide flange:' },
    { k: 'para', n: '1', d: 4, t: 'ASTM A 992.' },
    { k: 'para', n: '2', d: 4, t: 'Galvanized.' },
    { k: 'para', n: 'a', d: 5, t: 'Hot dip.' },
  ]), `deep labels: ${JSON.stringify(out.body)}`);
}

// A scan: pages with no text layer.
{
  const out = parseSection({ section: '09 51 13', title: 'Acoustical Panel Ceilings', pages: [{ page: 1, text: '' }, { page: 2, text: '  \n ' }] });
  check(out.status === 'no_text' && out.body.length === 0, 'no text layer: no_text');
}

// Re-run safe: the same pages give the same blocks.
check(same(parseSection(SOURCE, running), parseSection(SOURCE, running)), 'the same input gives the same blocks');

// The running lines: digits read as '#', and only lines on a fifth of the book.
{
  check(normLine('  Sample  School   Page 12 ') === 'Sample School Page #', 'normLine squeezes spaces and digits');
  const set = runningSet({ pages: 100, lines: { 'Sample School': 90, 'Rare line': 5 } });
  check(set.has('Sample School') && !set.has('Rare line'), 'a line on 5 pages of 100 is not a running head');
}
