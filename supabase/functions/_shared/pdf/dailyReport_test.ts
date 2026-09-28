// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the daily report builder on
// synthetic reports: pages grow with long notes, nothing is dropped or drawn off the page, photos 1/2/4 per page, the
// last page keeps room for the stamp.
import { PDFDocument } from 'pdf-lib';
import { dailyContentSchema, type DailyHeader } from '../dailies.ts';
import { buildDailyReportPdf, type DailyPdfInput, type DailyPdfPhoto, dayLabel, type DrawnText, instantLabel, PhotoReadError, SIGN_SPACE } from './dailyReport.ts';
import { stampSignature } from './stamp.ts';

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

const HEADER: DailyHeader = {
  project_name: 'Sample Job A',
  project_number: 'S-100',
  project_address: '1 Sample Way',
  author_name: 'Pat Sample',
  author_company: 'Sample Builders',
  label: 'Daily Report',
  timezone: 'America/Los_Angeles',
};

function input(content: unknown, photos: DailyPdfPhoto[] = [], photosPerPage: 1 | 2 | 4 = 2): DailyPdfInput {
  return { header: HEADER, number: 7, dateLabel: 'Mon, Sep 28, 2026', content: dailyContentSchema.parse(content), photos, photosPerPage };
}

async function build(i: DailyPdfInput): Promise<{ pages: number; drawn: DrawnText[] }> {
  const drawn: DrawnText[] = [];
  const bytes = await buildDailyReportPdf(i, (t) => drawn.push(t));
  return { pages: (await PDFDocument.load(bytes)).getPageCount(), drawn };
}

/** Numbered words so each one can be looked for: "w0001 w0002 ...". */
function words(from: number, count: number): string {
  return Array.from({ length: count }, (_, i) => `w${String(from + i).padStart(4, '0')}`).join(' ');
}

function photo(bytes: Uint8Array, mime: string, caption: string): DailyPdfPhoto {
  return { bytes, mime, caption, stamp: 'Sample Job A · Sep 26, 2026 4:05 PM PDT', rowLabel: null };
}

Deno.test('daily pdf: a short report is one page with the title, job and author', async () => {
  const { pages, drawn } = await build(input({
    weather: 'Clear, 70F',
    work: [{ key: 'k1', company: 'Sample Concrete', description: 'Formed footings', headcount: 4, hours: 32 }],
    notes: { general: 'Sample general note.' },
  }));
  check(pages === 1, 'one page');
  const text = drawn.map((d) => d.text).join('\n');
  for (const s of ['Daily Report #7', 'Sample Job A', 'Pat Sample, Sample Builders', 'Weather: Clear, 70F', 'Sample Concrete', '32', 'Sample general note.', 'Page 1 of 1']) {
    check(text.includes(s), `drawn text includes "${s}"`);
  }
});

Deno.test('daily pdf: long notes flow onto more pages, and more text means more pages', async () => {
  const short = await build(input({ notes: { general: words(1, 300) } }));
  const long = await build(input({ notes: { general: words(1, 3000) } }));
  const longer = await build(input({ notes: { general: words(1, 3000), safety: words(3001, 3000) } }));
  check(long.pages > short.pages, `${long.pages} pages > ${short.pages}`);
  check(longer.pages > long.pages, `${longer.pages} pages > ${long.pages}`);
});

Deno.test('daily pdf: nothing is dropped or drawn off the page', async () => {
  const giant = 'x'.repeat(600);
  const rowText = words(8001, 600);
  const { pages, drawn } = await build(input({
    work: [{ key: 'k1', company: 'Sample Crew With A Very Long Company Name That Must Wrap', description: rowText, headcount: 3, hours: 24 }],
    notes: { general: `${words(1, 2500)}\n\nSecond paragraph ${giant} end`, qc: words(5001, 800) },
  }));
  check(pages >= 3, `several pages (${pages})`);
  const all = drawn.map((d) => d.text).join(' ');
  for (let i = 1; i <= 2500; i++) check(all.includes(`w${String(i).padStart(4, '0')}`), `general note word ${i} drawn`);
  for (let i = 5001; i <= 5800; i++) check(all.includes(`w${String(i).padStart(4, '0')}`), `QC word ${i} drawn`);
  for (let i = 8001; i <= 8600; i++) check(all.includes(`w${String(i).padStart(4, '0')}`), `work-log word ${i} drawn`);
  check(drawn.map((d) => d.text).join('').includes(giant), 'a word longer than a line is broken, not cut');
  for (const d of drawn) {
    check(d.y >= 20 && d.y <= 792 - 40, `baseline on the page (${d.y}) for "${d.text.slice(0, 20)}"`);
    check(d.x >= 48 && d.x < 612 - 48, `x inside the margins (${d.x})`);
  }
  const headers = drawn.filter((d) => d.text === 'Description').length;
  check(headers >= 2, 'the work-log header repeats on a continuation page');
});

Deno.test('daily pdf: the last page keeps room for the signature stamp', async () => {
  for (const count of [10, 120, 400, 1700]) {
    const { pages, drawn } = await build(input({ notes: { general: words(1, count) } }));
    const last = drawn.filter((d) => d.page === pages - 1 && !d.text.startsWith('Page ') && d.y > 30);
    check(last.every((d) => d.y >= SIGN_SPACE), `nothing but the footer below ${SIGN_SPACE}pt on the last page (${count} words)`);
  }
});

Deno.test('daily pdf: photos 1, 2 or 4 per page', async () => {
  const photos = [photo(JPEG, 'image/jpeg', 'Sample footing'), photo(PNG, 'image/png', 'Sample slab'), photo(JPEG, 'image/jpeg', '')];
  const base = { notes: { general: 'Photos follow.' } };
  const one = await build(input(base, photos, 1));
  const two = await build(input(base, photos, 2));
  const four = await build(input(base, photos, 4));
  check(one.pages === 1 + 3, `1 per page: ${one.pages}`);
  check(two.pages === 1 + 2, `2 per page: ${two.pages}`);
  check(four.pages === 1 + 1, `4 per page: ${four.pages}`);
  const text = two.drawn.map((d) => d.text).join('\n');
  check(text.includes('Sample footing') && text.includes('Sample slab'), 'captions drawn');
  check(text.includes('Sample Job A · Sep 26, 2026 4:05 PM PDT'), 'job and time stamp drawn');
});

Deno.test('daily pdf: a photo that is not a JPEG or PNG is refused by number', async () => {
  const err = await buildDailyReportPdf(input({}, [photo(PNG, 'image/png', 'ok'), photo(new Uint8Array([1, 2, 3]), 'image/jpeg', 'bad')]))
    .then(() => null, (e: unknown) => e);
  check(err instanceof PhotoReadError && err.index === 1, 'PhotoReadError for photo 2');
});

Deno.test('daily pdf: characters the standard fonts lack become "?" instead of failing', async () => {
  const { drawn } = await build(input({ notes: { general: 'Arrow → and a snowman ☃ and a "quote"' } }));
  check(drawn.some((d) => d.text.includes('Arrow ? and a snowman ? and a "quote"')), 'replaced, not dropped');
});

Deno.test('daily pdf: the one stamp goes on the built PDF', async () => {
  const bytes = await buildDailyReportPdf(input({ notes: { general: words(1, 1200) } }));
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  const stamped = await stampSignature(bytes, { signaturePng: PNG, name: 'Pat Sample', signedAtLabel: 'Sep 26, 2026 4:05 PM PDT' });
  check((await PDFDocument.load(stamped)).getPageCount() === pages, 'same page count after stamping');
});

Deno.test('daily pdf: dates in the job zone', () => {
  check(dayLabel('2026-09-28') === 'Mon, Sep 28, 2026', `day label: ${dayLabel('2026-09-28')}`);
  const at = instantLabel('2026-09-26T23:05:00Z', 'America/Los_Angeles');
  check(at === 'Sep 26, 2026 4:05 PM PDT', `instant label: ${at}`);
  const winter = instantLabel('2026-01-08T03:30:00Z', 'America/Los_Angeles');
  check(winter === 'Jan 7, 2026 7:30 PM PST', `Pacific evening, standard time: ${winter}`);
});
