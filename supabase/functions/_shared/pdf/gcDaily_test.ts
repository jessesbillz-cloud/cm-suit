// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the superintendent's and the
// foreman's daily (reportForms.ts) on synthetic reports: the title block, the weather line, each table with its column
// titles and totals, the long fields; empty parts left out; a long table flows onto more pages with its column titles
// again and nothing dropped or drawn off a page; photos 1/2/4 a page; the ONE stamp signs the last page.
import { PDFDocument } from 'pdf-lib';
import { dailyContentSchema, type DailyHeader } from '../dailies.ts';
import { dailyValues, REPORT_FORMS, type ReportForm } from '../reportForms.ts';
import { type DailyPdfPhoto, type DrawnText, PhotoReadError, SIGN_SPACE } from './dailyReport.ts';
import { buildFormDailyPdf, type FormDailyPdfInput } from './gcDaily.ts';
import { stampSignature } from './stamp.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function b64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// A synthetic 1x1 PNG.
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

const HEADER: DailyHeader = {
  project_name: 'Sample Medical Office',
  project_number: 'S-500',
  project_address: '1 Sample Way',
  author_name: 'Sam Super',
  author_company: 'Sample Builders',
  label: 'Daily Report',
  timezone: 'America/Los_Angeles',
};

const GC: ReportForm = REPORT_FORMS.gc_daily;
const FOREMAN: ReportForm = REPORT_FORMS.foreman_daily;

/** A report on a form from content as saved (parsed by the one content schema). */
function input(form: ReportForm, content: unknown, photos: DailyPdfPhoto[] = [], photosPerPage: 1 | 2 | 4 = 2): FormDailyPdfInput {
  const c = dailyContentSchema.parse(content);
  return {
    form,
    header: form === FOREMAN ? { ...HEADER, label: 'Foreman Daily', author_name: 'Fay Foreman', author_company: 'Sample Framing' } : HEADER,
    number: 12,
    dateLabel: 'Tue, Sep 29, 2026',
    day: dailyValues(form, c.fields, c.standing_note),
    tables: c.tables,
    inspections: c.inspections.map((e) => e.text),
    photos,
    photosPerPage,
  };
}

async function build(i: FormDailyPdfInput): Promise<{ bytes: Uint8Array; pages: number; drawn: DrawnText[] }> {
  const drawn: DrawnText[] = [];
  const bytes = await buildFormDailyPdf(i, (t) => drawn.push(t));
  return { bytes, pages: (await PDFDocument.load(bytes)).getPageCount(), drawn };
}

function row(key: string, cells: Record<string, string>, carry = false) {
  return { key, ref: null, carry, cells };
}

/** Numbered words so each one can be looked for: "w0001 w0002 ...". */
function words(from: number, count: number): string {
  return Array.from({ length: count }, (_, i) => `w${String(from + i).padStart(4, '0')}`).join(' ');
}

function photo(caption: string): DailyPdfPhoto {
  return { bytes: PNG, mime: 'image/png', caption, stamp: 'Sample Medical Office · Sep 29, 2026 10:05 AM PDT', rowLabel: null };
}

const GC_DAY = {
  standing_note: 'Work per the approved sample documents.',
  fields: { conditions: 'Clear, Wind', high: '78', low: '61', delays: 'Waiting on sample RFI 14 at grid C.',
            safety: 'Tailgate held: Heat illness prevention (6 signed in)' },
  tables: {
    manpower: [row('m1', { company: 'Sample Framing', trade: 'Framer', count: '4', hours: '32' }, true),
               row('m2', { company: 'Sample Electric', trade: 'Electrician', count: '2', hours: '15.5' }, true)],
    equipment: [row('e1', { equipment: 'Sample scissor lift', company: 'Sample Framing', hours: '6' }, true)],
    work: [row('w1', { company: 'Sample Framing', area: 'Level 2, grid A-C', work: 'Framed north wall' })],
    deliveries: [row('d1', { time: '7:00 AM', company: 'Sample Concrete Co', material: 'Slab pour' })],
    inspections: [row('i1', { time: '8:00 AM', inspection: 'IOR #3: Shear walls, level 2', result: 'Confirmed' })],
    visitors: [],
  },
};

Deno.test('gc daily pdf: a short report is one page with every part it has', async () => {
  const { pages, drawn } = await build(input(GC, GC_DAY));
  check(pages === 1, `one page (${pages})`);
  const text = drawn.map((d) => d.text).join('\n');
  for (const s of [
    'Daily Report #12', 'Sample Medical Office', 'Job S-500 · 1 Sample Way', 'Tue, Sep 29, 2026 · Sam Super, Sample Builders',
    'Weather', 'Conditions: Clear, Wind · High: 78°F · Low: 61°F',
    'Manpower', 'Company', 'Trade', 'Count', 'Hours', 'Sample Framing', 'Framer', 'Sample Electric',
    'Equipment', 'Sample scissor lift', 'Work performed', 'Level 2, grid A-C', 'Framed north wall',
    'Deliveries', '7:00 AM', 'Sample Concrete Co', 'Slab pour', 'Inspections', 'IOR #3: Shear walls, level 2', 'Confirmed',
    'Delays / issues', 'Waiting on sample RFI 14 at grid C.', 'Safety', 'Tailgate held: Heat illness prevention (6 signed in)',
    'Notes', 'Work per the approved sample documents.', 'Page 1 of 1',
  ]) {
    check(text.includes(s), `drawn text includes "${s}"`);
  }
  check(!text.includes('Visitors'), 'an empty table is left out');
});

Deno.test('gc daily pdf: count and hours are totaled under their columns', async () => {
  const { drawn } = await build(input(GC, GC_DAY));
  const total = drawn.filter((d) => d.text === 'Total');
  check(total.length === 1, `a total under manpower; none under the one equipment row (${total.length})`);
  const manpowerTotal = total[0];
  if (!manpowerTotal) throw new Error('no total');
  const sameLine = drawn.filter((d) => d.page === manpowerTotal.page && d.y === manpowerTotal.y).map((d) => d.text);
  check(sameLine.includes('6') && sameLine.includes('47.5'), `manpower total 6 people, 47.5 hours (${sameLine.join(' | ')})`);
});

Deno.test('gc daily pdf: a long table flows onto more pages, column titles again, nothing dropped or off the page', async () => {
  const many = Array.from({ length: 70 }, (_, i) =>
    row(`m${i}`, { company: `Sample Company ${String(i + 1).padStart(3, '0')}`, trade: 'Laborer', count: '1', hours: '8' }));
  const longWork = words(1, 570); // a cell holds up to 4000 characters
  const { pages, drawn } = await build(input(GC, {
    tables: { manpower: many, work: [row('w1', { company: 'Sample Framing', area: 'x'.repeat(300), work: longWork })] },
    fields: { notes: words(2001, 1500) },
  }));
  check(pages >= 3, `several pages (${pages})`);
  check(drawn.filter((d) => d.text === 'Count').length >= 2, 'the column titles repeat on the next page');
  const text = drawn.map((d) => d.text).join(' ');
  for (let i = 1; i <= 70; i++) check(text.includes(`Sample Company ${String(i).padStart(3, '0')}`), `row ${i} drawn`);
  for (let i = 1; i <= 570; i++) check(text.includes(`w${String(i).padStart(4, '0')}`), `work word ${i} drawn`);
  for (let i = 2001; i <= 3500; i++) check(text.includes(`w${String(i).padStart(4, '0')}`), `note word ${i} drawn`);
  const xs = drawn.filter((d) => /^x+$/.test(d.text)).reduce((n, d) => n + d.text.length, 0);
  check(xs === 300, `a word longer than its column is broken, not dropped (${xs} of 300)`);
  const totalLine = drawn.find((d) => d.text === 'Total');
  check(totalLine !== undefined, 'a total after the long table');
  for (const d of drawn) {
    check(d.y >= 20 && d.y <= 792 - 40, `baseline on the page (${d.y}) for "${d.text.slice(0, 20)}"`);
    check(d.x >= 48 && d.x < 612 - 48, `x inside the margins (${d.x}) for "${d.text.slice(0, 20)}"`);
  }
});

Deno.test('foreman daily pdf: crew and hours, work done, materials and issues', async () => {
  const { pages, drawn } = await build(input(FOREMAN, {
    fields: { materials: 'Received sample studs.', issues: 'Short two sample framers.' },
    tables: {
      crew: [row('c1', { name: 'Ann Sample', trade: 'Framer', hours: '8' }, true), row('c2', { name: 'Bob Sample', trade: 'Framer', hours: '7' }, true)],
      work: [row('w1', { area: 'Level 2', work: 'Framed walls', qty: '120 LF' })],
    },
  }));
  check(pages === 1, 'one page');
  const text = drawn.map((d) => d.text).join('\n');
  for (const s of ['Foreman Daily #12', 'Fay Foreman, Sample Framing', 'Crew', 'Ann Sample', 'Bob Sample', 'Work done', '120 LF',
    'Materials', 'Received sample studs.', 'Delays / issues', 'Short two sample framers.']) {
    check(text.includes(s), `drawn text includes "${s}"`);
  }
  check(text.includes('15'), 'crew hours totaled');
  check(!text.includes('Weather'), 'the foreman form has no weather line');
});

Deno.test('gc daily pdf: photos 1, 2 or 4 a page, the last page keeps room for the stamp', async () => {
  const photos = Array.from({ length: 5 }, (_, i) => photo(`Sample photo ${i + 1}`));
  for (const [per, extra] of [[1, 5], [2, 3], [4, 2]] as const) {
    const { pages, drawn } = await build(input(GC, GC_DAY, photos, per));
    check(pages === 1 + extra, `${per} a page: ${1 + extra} pages (${pages})`);
    const last = drawn.filter((d) => d.page === pages - 1 && d.y > 30);
    check(last.every((d) => d.y >= SIGN_SPACE), `nothing but the footer below ${SIGN_SPACE}pt on the last page (${per} a page)`);
    check(drawn.some((d) => d.text === 'Sample photo 5'), 'the last caption is drawn');
  }
});

Deno.test('gc daily pdf: a photo that cannot be read is refused by number', async () => {
  let err: unknown = null;
  try {
    await build(input(GC, GC_DAY, [photo('ok'), { ...photo('bad'), bytes: new Uint8Array([1, 2, 3]) }]));
  } catch (e) {
    err = e;
  }
  check(err instanceof PhotoReadError && err.index === 1, 'PhotoReadError for photo 2');
});

Deno.test('gc daily pdf: the ONE stamp signs the last page', async () => {
  const { bytes } = await build(input(GC, GC_DAY, [photo('one')], 1));
  const stamped = await stampSignature(bytes, { signaturePng: PNG, name: 'Sam Super', signedAtLabel: 'Sep 29, 2026 4:05 PM PDT' });
  const doc = await PDFDocument.load(stamped);
  check(doc.getPageCount() === 2, 'the stamp adds no page');
});
