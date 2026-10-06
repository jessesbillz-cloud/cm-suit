// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the VIS daily report builder on
// synthetic reports: page 1 carries the form's table and notes, long notes make continuation pages with nothing
// dropped or drawn off a page, photos paginate 1/2/4 per page, described photos get Photo Analysis pages, a value too
// long for its cell is refused by name, and the stamp signs page 1's signature line.
import { PDFDocument, PDFPage, StandardFonts } from 'pdf-lib';
import { dailyValues, lockedValues, REPORT_FORMS } from '../reportForms.ts';
import { PhotoReadError } from './dailyReport.ts';
import { stampSignature } from './stamp.ts';
import {
  buildVisPdf, type DrawnText, fitCell, FormFitError, noteParagraphs, VIS_SIGNATURE_AT, visDate, type VisPdfInput, type VisPhoto, visPhotoTime,
} from './vis.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function b64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// Synthetic images: a 1x1 PNG and a 4x3 gray JPEG.
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
const JPEG = b64(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwAoooqyD//Z',
);

const FORM = REPORT_FORMS.vis_daily;
const JOB = lockedValues(FORM, {
  project_name: 'Sample School Wing',
  project_no: 'S-400',
  jurisdiction: 'DSA',
  dsa_app: '04-000000',
  dsa_file: '00-00',
  ior: 'Pat Sample',
  project_manager: 'Sam Sample',
  architect: 'Sample Architects',
  contractor: 'Sample Builders',
  footer: '1 Sample Way, Sample City\nOffice 555-0100 | sample.test',
});

function input(day: Record<string, string>, photos: VisPhoto[] = [], photosPerPage: 1 | 2 | 4 = 4): VisPdfInput {
  return {
    ...visDate('2026-09-28'),
    job: JOB,
    day: dailyValues(FORM, day, 'Standing sample statement.'),
    inspections: [],
    inspector: 'Pat Sample',
    logo: PNG,
    photos,
    photosPerPage,
  };
}

async function build(i: VisPdfInput): Promise<{ bytes: Uint8Array; pages: number; drawn: DrawnText[] }> {
  const drawn: DrawnText[] = [];
  const bytes = await buildVisPdf(i, (t) => drawn.push(t));
  return { bytes, pages: (await PDFDocument.load(bytes)).getPageCount(), drawn };
}

/** Numbered words so each one can be looked for: "w0001 w0002 ...". */
function words(from: number, count: number): string {
  return Array.from({ length: count }, (_, i) => `w${String(from + i).padStart(4, '0')}`).join(' ');
}

function photo(caption: string, description = '', bytes = JPEG, time = ''): VisPhoto {
  return { bytes, caption, time, description };
}

function titles(drawn: DrawnText[], title: string): number {
  return drawn.filter((d) => d.text === title).length;
}

Deno.test('vis pdf: a short report is one page: the title, the table, the notes and the inspector', async () => {
  const { pages, drawn } = await build(input({ correction_notices: 'CN-001', contractor_activity: 'Sample framing, level 2' }));
  check(pages === 1, 'one page');
  const all = drawn.map((d) => d.text);
  for (const s of [
    '2026 Project Inspector’s Daily Report', 'Date:', '9/28/2026', 'Project Name:', 'Sample School Wing', 'DSA File #:', '00-00',
    'Correction Notices Issued:', 'CN-001', 'IR’s Received or Reviewed:', 'Contractor Activity', 'Sample framing, level 2',
    'IOR Notes:', 'Standing sample statement.', 'Project Inspector:', 'Pat Sample', '1 Sample Way, Sample City',
    'Office 555-0100 | sample.test',
  ]) {
    check(all.includes(s), `drawn text includes "${s}"`);
  }
  check(!all.some((t) => t.startsWith('Page ')), 'no page number on a one-page report');
});

Deno.test('vis pdf: long notes continue on "IOR Notes (continued)" pages; nothing dropped or off the page', async () => {
  const notes = Array.from({ length: 12 }, (_, i) => `SECTION ${String.fromCharCode(65 + i)}\n${words(i * 200 + 1, 200)}`).join('\n');
  const { pages, drawn } = await build(input({ ior_notes: notes }));
  check(pages >= 3, `${pages} pages`);
  check(titles(drawn, 'IOR Notes (continued)') === pages - 1, 'every later page is a notes continuation');
  const all = drawn.map((d) => d.text).join(' ');
  for (let n = 1; n <= 2400; n++) check(all.includes(`w${String(n).padStart(4, '0')}`), `word ${n} is on the report`);
  for (const d of drawn) {
    check(d.page >= 0 && d.x >= 30 && d.x < 580 && d.y > 20 && d.y < 770, `"${d.text.slice(0, 20)}" on page ${d.page} is on the page`);
  }
  // Page 1's notes stay above the signature line.
  for (const d of drawn.filter((t) => t.page === 0 && /^w\d{4}/.test(t.text))) check(d.y > 792 - 690, 'notes clear the signature area');
  check(drawn.some((d) => d.text === `Page ${pages} of ${pages}`), 'pages are numbered');
});

Deno.test('vis pdf: one paragraph longer than a page splits across pages instead of running off', async () => {
  const { pages, drawn } = await build(input({ ior_notes: words(1, 2500) }));
  check(pages >= 3, `${pages} pages`);
  const all = drawn.map((d) => d.text).join(' ');
  check(all.includes('w0001') && all.includes('w2500'), 'first and last word are there');
  for (const d of drawn) check(d.y > 20, `"${d.text.slice(0, 12)}" stays on the page`);
});

Deno.test('vis pdf: photos paginate 1, 2 or 4 per page after the notes', async () => {
  const five = [1, 2, 3, 4, 5].map((i) => photo(`Sample photo ${i} · Mon, Sep 28, 2026 at 9:0${i} AM`, '', i % 2 ? JPEG : PNG));
  for (const [per, photoPages] of [[1, 5], [2, 3], [4, 2]] as const) {
    const { pages, drawn } = await build(input({}, five, per));
    check(pages === 1 + photoPages, `${per} per page: ${pages} pages`);
    check(titles(drawn, 'Site Photos') === photoPages, `${per} per page: ${photoPages} photo pages`);
    check(drawn.some((d) => d.text.startsWith('Sample photo 5')), `${per} per page: the last caption is there`);
  }
});

Deno.test('vis pdf: described photos get Photo Analysis pages, two a page; a long description continues', async () => {
  const described = [1, 2, 3].map((i) => photo(`Tag ${i}`, `Product: Sample anchor ${i}\nListing: Sample ${i}`));
  const { pages, drawn } = await build(input({}, [photo('Plain'), ...described]));
  check(pages === 1 + 1 + 2, `${pages} pages: form, one photo page, two analysis pages`);
  check(titles(drawn, 'Photo Analysis') === 2, 'two analysis pages');
  check(drawn.some((d) => d.text === 'Product: Sample anchor 3'), 'the last description is there');

  const long = await build(input({}, [photo('Long', words(1, 1200))]));
  const all = long.drawn.map((d) => d.text).join(' ');
  check(all.includes('w0001') && all.includes('w1200'), 'a long description is printed whole');
  check(titles(long.drawn, 'Photo Analysis') >= 2, 'and continues on another page');
});

Deno.test('vis pdf: a described photo: its title heads the description beside it, the time under it, no gray box (Oct 5)', async () => {
  // Every filled rectangle drawn (the old analysis card was a light gray fill as big as a photo).
  const filled: number[] = [];
  const original = PDFPage.prototype.drawRectangle;
  PDFPage.prototype.drawRectangle = function (this: PDFPage, options) {
    if (options?.color !== undefined) filled.push(options.height ?? 0);
    return original.call(this, options);
  };
  try {
    const p = photo('Fire caulk at corridor 210', 'Listed system W-L-0000. No gaps at the deck.', JPEG, 'Mon, Sep 28, 2026 at 9:14 AM');
    const { pages, drawn } = await build(input({}, [p]));
    check(pages === 2, `${pages} pages: the form and one analysis page`);
    const title = drawn.filter((d) => d.text === 'Fire caulk at corridor 210');
    const desc = drawn.find((d) => d.text.startsWith('Listed system W-L-0000'));
    const time = drawn.find((d) => d.text === 'Mon, Sep 28, 2026 at 9:14 AM');
    check(title.length === 1, 'the title is printed once');
    const t = title[0] as DrawnText;
    check(desc !== undefined && time !== undefined, 'the description and the time are printed');
    check(t.page === 1 && t.x >= 290, `the title is beside the photo, not under it (x ${t.x})`);
    check(t.y > (desc as DrawnText).y && Math.abs(t.x - (desc as DrawnText).x) < 1, 'the title is right above its description');
    check(t.size > (desc as DrawnText).size, 'the title reads as a heading');
    check((time as DrawnText).x < 272, 'the time is under the photo');
    check(filled.length === 0, `no filled box is drawn (${filled.length})`);
  } finally {
    PDFPage.prototype.drawRectangle = original;
  }
});

Deno.test('vis pdf: a table value shrinks and wraps to fit; one too long for its cell is refused by name', async () => {
  const long = 'CN-001, CN-002, CN-003, CN-004, CN-005, CN-006, CN-007, CN-008, CN-009, CN-010';
  const { drawn } = await build(input({ correction_notices: long }));
  const parts = drawn.filter((d) => d.text.includes('CN-0'));
  check(parts.length >= 2, 'wrapped onto more lines');
  check(parts.every((d) => d.size < 10), 'at a smaller size');
  check(parts.map((d) => d.text).join(' ').includes('CN-010'), 'nothing cut off');

  const err = await buildVisPdf(input({ correction_notices: words(1, 200) })).then(() => null, (e: unknown) => e);
  check(err instanceof FormFitError && err.message.includes('Correction Notices Issued'), 'refused, naming the field');
});

Deno.test('vis pdf: the longest value each field allows fits its cell', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  // Realistic text (words and numbers), at each field's max length.
  const sample = (n: number) => 'Sample value 1234 '.repeat(Math.ceil(n / 18)).slice(0, n);
  const values = Object.fromEntries([...FORM.locked, ...FORM.daily].filter((f) => f.max <= 300).map((f) => [f.key, sample(f.max)]));
  const { pages } = await build({ ...input(values), job: lockedValues(FORM, values) });
  check(pages === 1, 'every field at its max fits page 1');
  check(fitCell(font, sample(80), 90, 20) !== null, 'a narrow 20pt cell takes 80 characters');
});

Deno.test('vis pdf: bad photos and logos are refused', async () => {
  const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const e1 = await buildVisPdf(input({}, [photo('ok'), photo('bad', '', bad)])).then(() => null, (e: unknown) => e);
  check(e1 instanceof PhotoReadError && e1.index === 1, 'the second photo is named');
  const e2 = await buildVisPdf({ ...input({}), logo: bad }).then(() => null, (e: unknown) => e);
  check(e2 instanceof Error && e2.message.includes('logo'), 'a bad logo is refused');
  const noLogo = await build({ ...input({}), logo: null });
  check(noLogo.pages === 1, 'no logo is fine');
});

Deno.test('vis pdf: the stamp signs page 1\'s signature line', async () => {
  const { bytes } = await build(input({}, [photo('One')]));
  const signed = await stampSignature(bytes, { signaturePng: PNG, name: 'Pat Sample', signedAtLabel: 'Sep 28, 2026 4:05 PM PDT', at: VIS_SIGNATURE_AT });
  check((await PDFDocument.load(signed)).getPageCount() === 2, 'still two pages');
});

Deno.test('vis notes: MDR\'s paragraph and header rules', () => {
  const plain = noteParagraphs('CONCRETE POUR — LEVEL 2\nCEMEX delivered 9 yards.\n\n---\nSTRUCTURAL STEEL\nBolts torqued.');
  check(JSON.stringify(plain.map((p) => p.header)) === '[true,false,true,false]', 'caps lines are headers; "CEMEX delivered" is not');
  check(plain.length === 4, 'blank lines and --- dropped');
  const md = noteParagraphs('**Framing**\nALL CAPS BODY\nText with **bold** inside');
  check(JSON.stringify(md.map((p) => [p.text, p.header])) === '[["Framing",true],["ALL CAPS BODY",false],["Text with bold inside",false]]',
    'with **bold** lines only those are headers, and ** never prints');
});

Deno.test('vis photo time: in the job zone (a Pacific evening is still that day)', () => {
  check(visPhotoTime('2026-09-29T02:14:00Z', 'America/Los_Angeles') === 'Mon, Sep 28, 2026 at 7:14 PM', visPhotoTime('2026-09-29T02:14:00Z', 'America/Los_Angeles'));
});

Deno.test('vis date: M/D/YYYY and the year', () => {
  const d = visDate('2026-09-05');
  check(d.date === '9/5/2026' && d.year === '2026', 'formatted');
  let threw = false;
  try {
    visDate('Sep 5');
  } catch {
    threw = true;
  }
  check(threw, 'a non-day is refused');
});
