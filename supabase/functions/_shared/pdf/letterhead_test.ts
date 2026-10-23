// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the job's brand letterhead (0110) on
// synthetic data: laid out with and without a logo, and printed by the IR, the dailies, the RFI and the map only when
// the job's brand has one.
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { brandOf, letterheadKey, letterheadOf } from '../brand.ts';
import { dailyContentSchema, type DailyHeader } from '../dailies.ts';
import { buildDailyReportPdf } from './dailyReport.ts';
import { buildInspectionReport, type InspectionReportInput } from './inspectionReport.ts';
import { buildIrMap } from './irMap.ts';
import { LOGO_BOX, type Letterhead, layoutLetterhead } from './letterhead.ts';
import { buildRfiPdf, type RfiPdfInput } from './rfi.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

// A 1x1 PNG (synthetic): scaled up to the logo box's height.
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const LETTERHEAD: Letterhead = { name: 'Sample Fire Office', lines: ['1 Sample Campus Way, Sample City', '(555) 010-0100'], logo: PNG_1PX };

/** Every content stream of a page, decoded, as Latin-1 text. */
function pageContent(doc: PDFDocument, index = 0): string {
  const contents = doc.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : ''))
    .join('\n');
}

/** Standard-font text is written as hex in the content stream. */
function shows(content: string, text: string): boolean {
  return content.includes(`<${Array.from(text, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()}`);
}

function drawsImage(content: string): boolean {
  return /\/Image[^\s]* Do/.test(content);
}

async function firstPage(bytes: Uint8Array): Promise<string> {
  return pageContent(await PDFDocument.load(bytes));
}

Deno.test('letterhead: with a logo the text sits right of it, the logo fills the box height', async () => {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const withLogo = await layoutLetterhead(doc, fonts, LETTERHEAD, 400);
  const without = await layoutLetterhead(doc, fonts, { ...LETTERHEAD, logo: null }, 400);
  check(withLogo.height === LOGO_BOX.height, 'the logo sets the height');
  check(withLogo.width > without.width && withLogo.width <= 400, 'the logo widens it, within the width');
  check(without.height === 15 + 4 + 2 * 11, 'without a logo: the name and two lines');
  const page = doc.addPage([612, 792]);
  withLogo.draw(page, 48, 744);
  const content = pageContent(await PDFDocument.load(await doc.save()));
  check(shows(content, 'Sample Fire Office') && shows(content, '(555) 010-0100'), 'name and lines drawn');
  check(drawsImage(content), 'logo drawn');
});

Deno.test('letterhead: a long name wraps to three lines at most, never past the width', async () => {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const lh = await layoutLetterhead(doc, fonts, { name: 'Sample '.repeat(40), lines: [], logo: null }, 200);
  check(lh.width <= 200, 'within the width');
  check(lh.height === 3 * 15 + 4, 'three name lines');
});

Deno.test('letterhead: not a JPEG or PNG is refused by name', async () => {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
  let message = '';
  await layoutLetterhead(doc, fonts, { ...LETTERHEAD, logo: svg }, 400).catch((e: unknown) => {
    message = e instanceof Error ? e.message : '';
  });
  check(message === 'The company logo is not a JPEG or PNG.', 'refused');
});

Deno.test('brand: prints only with a logo or a letterhead; the print name wins; the key follows what prints', async () => {
  const org = { id: 'o1', name: 'Sample Office', logo_path: null };
  const bare = brandOf(org, null);
  check(letterheadOf(bare, null) === null, 'nothing set: nothing prints');
  check((await letterheadKey(null)) === null, 'nothing set: no key');
  const lines = brandOf(org, { print_name: ' Sample Fire Office ', address: '1 Sample Way', phone: '', website: null });
  check(lines.name === 'Sample Fire Office' && lines.lines.join('|') === '1 Sample Way', 'trimmed, blanks dropped');
  check(letterheadOf(lines, null)?.name === 'Sample Fire Office', 'a letterhead alone prints');
  check(letterheadOf(bare, PNG_1PX)?.name === 'Sample Office', 'a logo alone prints, with the company name');
  const a = await letterheadKey(letterheadOf(lines, null));
  const b = await letterheadKey(letterheadOf(lines, PNG_1PX));
  check(JSON.stringify(a) !== JSON.stringify(b), 'a logo changes the key');
});

function ir(over: Partial<InspectionReportInput> = {}): InspectionReportInput {
  return {
    job: { name: 'Sample Job A', number: 'S-100', address: '100 Sample Way' }, gc: 'Sample Builders', inspector: 'Pat Sample',
    number: 12, dateLabel: 'Thu, Oct 1, 2026', timeLabel: '9:00 AM', durationLabel: '1 hr', typeLabel: 'OFS',
    company: 'Sample Drywall Co', requestedBy: 'Sam Sample', items: 'Level 2 rated walls', resultLabel: 'Approved', approved: true,
    resultNote: null, photos: [], postponed: null, ...over,
  };
}

Deno.test('IR: the letterhead heads it when the brand has one, and nothing changes without one', async () => {
  const plain = await firstPage(await buildInspectionReport(ir()));
  check(!shows(plain, 'Sample Fire Office') && !drawsImage(plain), 'no brand: no letterhead');
  const branded = await firstPage(await buildInspectionReport(ir({ letterhead: LETTERHEAD })));
  check(shows(branded, 'Sample Fire Office') && shows(branded, '1 Sample Campus Way, Sample City') && drawsImage(branded), 'branded');
  check(shows(branded, 'INSPECTION REPORT'), 'the form is still there');
});

const HEADER: DailyHeader = {
  project_name: 'Sample Job A', project_number: 'S-100', project_address: '1 Sample Way', author_name: 'Pat Sample',
  author_company: 'Sample Builders', label: 'Daily Report', timezone: 'America/Los_Angeles',
};

Deno.test('daily: the letterhead heads the first page only', async () => {
  const content = dailyContentSchema.parse({ notes: { general: 'Sample notes '.repeat(600) } });
  const base = { header: HEADER, number: 7, dateLabel: 'Mon, Sep 28, 2026', content, photos: [], photosPerPage: 2 as const };
  const plain = await firstPage(await buildDailyReportPdf(base));
  check(!shows(plain, 'Sample Fire Office'), 'no brand: no letterhead');
  const doc = await PDFDocument.load(await buildDailyReportPdf({ ...base, letterhead: LETTERHEAD }));
  check(doc.getPageCount() > 1, 'the notes run onto a second page');
  check(shows(pageContent(doc, 0), 'Sample Fire Office') && drawsImage(pageContent(doc, 0)), 'page 1 carries it');
  check(!shows(pageContent(doc, 1), 'Sample Fire Office'), 'page 2 does not');
});

function rfi(over: Partial<RfiPdfInput> = {}): RfiPdfInput {
  return {
    orgName: 'Sample Builders', logo: null, letterhead: [], job: { name: 'Sample Job A', number: 'S-100', address: null },
    number: 3, mark: null, title: 'Slab edge', question: 'Which governs?', suggestion: '', refs: '', from: { name: 'Sam', company: 'Co' },
    to: 'Architect', sentLabel: null, issuedLabel: null, dueLabel: null, neededByLabel: null, costImpact: null, timeImpact: null,
    otherPhotos: [], photos: [], answer: null, impactDays: 7, claim: null, ...over,
  };
}

Deno.test('RFI: the brand name heads it as before; letterhead lines print under it', async () => {
  const plain = await firstPage(await buildRfiPdf(rfi()));
  check(shows(plain, 'Sample Builders') && !drawsImage(plain), 'the name, no logo');
  const branded = await firstPage(await buildRfiPdf(rfi({ orgName: 'Sample Fire Office', logo: PNG_1PX, letterhead: ['(555) 010-0100'] })));
  check(shows(branded, 'Sample Fire Office') && shows(branded, '(555) 010-0100') && drawsImage(branded), 'branded');
});

Deno.test('map: the letterhead heads the title box when the brand has one', async () => {
  const sheetDoc = await PDFDocument.create();
  sheetDoc.addPage([2592, 1728]).drawRectangle({ x: 500, y: 500, width: 900, height: 600, borderWidth: 8 });
  const sheet = await sheetDoc.save();
  const base = {
    sheet, page: 1, strokes: [{ c: 1 as const, w: 0.004, p: [[0.2, 0.2], [0.6, 0.2]] as [number, number][] }],
    title: 'IR 12 Sample', legend: [{ color: 1 as const, name: 'Sample wall' }], stamp: null,
  };
  const plain = await firstPage(await buildIrMap(base));
  check(!shows(plain, 'Sample Fire Office') && shows(plain, 'IR 12 Sample'), 'no brand: the title box as it was');
  const branded = await firstPage(await buildIrMap({ ...base, letterhead: LETTERHEAD }));
  check(shows(branded, 'Sample Fire Office') && shows(branded, 'IR 12 Sample') && drawsImage(branded), 'branded');
});
