// The VIS Inspector's Daily Report (SPEC §8.3, company form generators): MDR's VIS form rebuilt as a pure PDF builder.
// Data in, bytes out (pdf-lib, standard fonts). Rendered only on the server from the saved report (submit-daily); the
// signature goes on afterwards through the ONE stamp (stamp.ts) at VIS_SIGNATURE_AT, page 1's signature line.
//
// Page 1 is the company's form at the template's coordinates (Letter; top-down y as measured on the template): logo,
// title bar, the job and daily table, the IOR Notes box, the signature line and the footer. Nothing is cut off: a table
// value shrinks and wraps to fit its cell (a value too long even then is refused by name, FormFitError); notes flow onto
// "IOR Notes (continued)" pages; photos follow 1/2/4 per page ("Site Photos"); photos with a description get "Photo
// Analysis" pages: the photo left with its time under it, its title and description as text beside it (no box), a long
// description running on down the page and onto the next. The logo and footer are the company's data
// (orgs.logo_path, the setup's job values), passed in; nothing about the company is in this file.
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { REPORT_FORMS } from '../reportForms.ts';
import { PhotoReadError } from './dailyReport.ts';
import { pdfSafe, wrapText } from './inspectionReport.ts';

export interface VisPhoto {
  /** JPEG or PNG (told apart by their bytes). */
  bytes: Uint8Array;
  /** The photo's title (the editor's "Title" box): under the photo on Site Photos, over its description on Photo
   *  Analysis. */
  caption: string;
  /** When it was taken (visPhotoTime), or '': under the photo. */
  time: string;
  /** Optional; a photo with one goes on the Photo Analysis pages. */
  description: string;
}

export interface VisPdfInput {
  /** The report date as the form prints it ("9/28/2026"), and its year (the title's). */
  date: string;
  year: string;
  /** The job values (reportForms lockedValues) and the day's values (reportForms dailyValues), by field key. */
  job: Readonly<Record<string, string>>;
  day: Readonly<Record<string, string>>;
  /** IR results on the report (content.inspections), after the notes. */
  inspections: readonly string[];
  /** Printed after "Project Inspector:". */
  inspector: string;
  /** The company logo (PNG or JPEG), or null. */
  logo: Uint8Array | null;
  photos: readonly VisPhoto[];
  photosPerPage: 1 | 2 | 4;
}

/** One piece of text as drawn (PDF coordinates). For tests: proves nothing was dropped or drawn off the page. */
export interface DrawnText {
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
}

/** A table value too long for its cell even at the smallest size. */
export class FormFitError extends Error {}

/** Where the ONE stamp signs: the signature sits on page 1's line (x 44-216), "Signed by" just right of it. */
export const VIS_SIGNATURE_AT = { page: 0, x: 44, y: 83, width: 172, height: 30 } as const;

const PW = 612;
const PH = 792;
const LM = 36;
const RM = 576;
const MID = 256.03;
const INK = rgb(0, 0, 0);
const LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  [...REPORT_FORMS.vis_daily.locked, ...REPORT_FORMS.vis_daily.daily].map((f) => [f.key, f.label]),
);

/** The table rows under the title bar: [label, value key] left and right of the middle line. */
const ROWS: readonly (readonly [readonly [string, string], readonly [string, string]])[] = [
  [['Date:', 'date'], ['Project Name:', 'project_name']],
  [['Project No:', 'project_no'], ['Jurisdiction:', 'jurisdiction']],
  [['DSA App:', 'dsa_app'], ['DSA File #:', 'dsa_file']],
  [['IOR:', 'ior'], ['Project Manager:', 'project_manager']],
  [['Architect:', 'architect'], ['Contractor:', 'contractor']],
  [['Correction Notices Issued:', 'correction_notices'], ['Observation Letters Issued:', 'observation_letters']],
];

/** IOR Notes: 10pt, 13pt lines, indented, a gap before each header. (MDR drew a bullet per paragraph, but its text
 *  cleaner blanked it, so its reports never showed one; neither do these.) */
const NOTES = { size: 10, lh: 13, gap: 13, x: 55, width: 520, firstTop: 312, firstBottom: 678, contTop: 150, contBottom: 740 };

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  pages: PDFPage[];
  input: VisPdfInput;
  onText: ((t: DrawnText) => void) | undefined;
}

interface Cell {
  top: number;
  h: number;
  /** The label's top (the template's). */
  labelTop: number;
}

/** Top-down y (as measured on the template) to PDF y. */
function vy(top: number): number {
  return PH - top;
}

/** Text whose top is at `top` (the template's convention: the baseline is one size below). */
function text(ctx: Ctx, page: PDFPage, s: string, x: number, top: number, size: number, font: PDFFont): void {
  const clean = pdfSafe(s).replace(/\n/g, ' ');
  if (clean.trim() === '') return;
  page.drawText(clean, { x, y: vy(top + size), size, font, color: INK });
  ctx.onText?.({ page: ctx.pages.indexOf(page), x, y: vy(top + size), size, text: clean });
}

function centered(ctx: Ctx, page: PDFPage, s: string, top: number, size: number, font: PDFFont): void {
  const clean = pdfSafe(s);
  text(ctx, page, clean, (PW - font.widthOfTextAtSize(clean, size)) / 2, top, size, font);
}

function box(page: PDFPage, x: number, top: number, w: number, h: number, width = 1): void {
  page.drawRectangle({ x, y: vy(top + h), width: w, height: h, borderColor: INK, borderWidth: width });
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    if (isPng(bytes)) return await doc.embedPng(bytes);
    if (isJpeg(bytes)) return await doc.embedJpg(bytes);
  } catch (e) {
    console.error('vis pdf: image failed to embed', e);
  }
  return null;
}

/** The logo in the template's logo box, keeping its shape (left, centered top to bottom). */
function drawLogo(ctx: Ctx, page: PDFPage): void {
  if (!ctx.logo) return;
  const bw = 128.2;
  const bh = 55.44;
  const scale = Math.min(bw / ctx.logo.width, bh / ctx.logo.height);
  const w = ctx.logo.width * scale;
  const h = ctx.logo.height * scale;
  page.drawImage(ctx.logo, { x: 36.34, y: vy(77.76) + (bh - h) / 2, width: w, height: h });
}

/** A page after the first: logo, title bar, "project | date". */
function addTitledPage(ctx: Ctx, title: string): PDFPage {
  const page = ctx.doc.addPage([PW, PH]);
  ctx.pages.push(page);
  drawLogo(ctx, page);
  box(page, LM, 85.76, 540, 26, 0.5);
  centered(ctx, page, title, 93.9, 14, ctx.bold);
  text(ctx, page, `${ctx.input.job['project_name'] ?? ''} | ${ctx.input.date}`, 39, 125, 10, ctx.font);
  return page;
}

// ---------------------------------------------------------------------------------------------------------------------
// Page 1: the table
// ---------------------------------------------------------------------------------------------------------------------

/** The largest size (10 down to 5) at which the value fits the cell, wrapped if needed; null when it can't. */
export function fitCell(font: PDFFont, value: string, width: number, height: number): { size: number; lines: string[] } | null {
  const flat = value.replace(/\s*\n\s*/g, ' ').trim();
  for (let size = 10; size >= 5; size -= 0.5) {
    const lines = wrapText(flat, font, size, width);
    if (lines.length === 1 || lines.length * size * 1.1 <= height - 2) return { size, lines };
  }
  return null;
}

/** The label, then its value in the rest of the cell up to `right`: on the label's baseline when it fits one line,
 *  else smaller and centered in the cell. */
function labeled(ctx: Ctx, page: PDFPage, label: string, value: string, x: number, right: number, cell: Cell, pad = 4): void {
  text(ctx, page, label, x, cell.labelTop, 10, ctx.bold);
  if (value.trim() === '') return;
  const from = x + ctx.bold.widthOfTextAtSize(pdfSafe(label), 10) + pad;
  const fitted = fitCell(ctx.font, value, right - from, cell.h);
  if (!fitted) throw new FormFitError(`${label.replace(/:$/, '')} is too long for the form. Shorten it.`);
  const { size, lines } = fitted;
  if (lines.length === 1) {
    text(ctx, page, lines[0] ?? '', from, cell.labelTop + 10 - size, size, ctx.font);
    return;
  }
  const lead = size * 1.1;
  const first = cell.top + (cell.h - lines.length * lead) / 2;
  lines.forEach((line, i) => {
    text(ctx, page, line, from, first + i * lead - size * 0.1, size, ctx.font);
  });
}

function valueOf(input: VisPdfInput, key: string): string {
  if (key === 'date') return input.date;
  return input.job[key] ?? input.day[key] ?? '';
}

function table(ctx: Ctx, page: PDFPage): void {
  const { input } = ctx;
  ROWS.forEach(([[leftLabel, leftKey], [rightLabel, rightKey]], i) => {
    const cell = { top: 111.76 + i * 20, h: 20, labelTop: 117.76 + i * 20 };
    box(page, LM, cell.top, 540, 20);
    page.drawLine({ start: { x: MID, y: vy(cell.top) }, end: { x: MID, y: vy(cell.top + 20) }, thickness: 1, color: INK });
    labeled(ctx, page, leftLabel, valueOf(input, leftKey), 39, MID - 4, cell);
    labeled(ctx, page, rightLabel, valueOf(input, rightKey), 259, RM - 4, cell);
  });
  box(page, LM, 237.76, 540, 20);
  labeled(ctx, page, `${LABELS['irs_received'] ?? ''}:`, input.day['irs_received'] ?? '', 39, RM - 4, { top: 237.76, h: 20, labelTop: 244 });
  box(page, LM, 259.76, 540, 22);
  labeled(ctx, page, LABELS['contractor_activity'] ?? '', input.day['contractor_activity'] ?? '', 39, RM - 4,
    { top: 259.76, h: 22, labelTop: 267 }, 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// IOR Notes
// ---------------------------------------------------------------------------------------------------------------------

export interface NotePara {
  text: string;
  header: boolean;
}

const BOLD_LINE = /^\*\*(.+?)\*\*\s*$/;
const CAPS_HEADER = /^[A-Z][A-Z\s/&-]+(\s[—-]\s|$)/;

/**
 * The notes as the form prints them (MDR's rules): one paragraph per line, blank lines and "---" rules dropped. When
 * the notes use **bold** lines, those (and only those) are headers; otherwise an ALL-CAPS line (or its part before
 * " — ") is one. MDR's second, looser caps rule is left out: it made "CEMEX delivered ..." a header.
 */
export function noteParagraphs(notes: string): NotePara[] {
  const src = notes.replace(/\r\n?/g, '\n');
  const markdown = /\*\*.+?\*\*/.test(src);
  const out: NotePara[] = [];
  for (const raw of src.split('\n')) {
    let t = raw.trim();
    if (t === '' || /^[-=_]{2,}$/.test(t)) continue;
    const bold = BOLD_LINE.exec(t);
    let header = false;
    if (bold) {
      header = true;
      t = (bold[1] ?? '').trim();
    } else if (!markdown) {
      header = CAPS_HEADER.test(t);
    }
    t = t.replace(/\*\*/g, '').trim();
    if (t !== '') out.push({ text: t, header });
  }
  return out;
}

interface NoteCursor {
  page: PDFPage;
  top: number;
  bottom: number;
  /** Nothing drawn on this page yet. */
  fresh: boolean;
}

function notesPage(ctx: Ctx): NoteCursor {
  return { page: addTitledPage(ctx, 'IOR Notes (continued)'), top: NOTES.contTop, bottom: NOTES.contBottom, fresh: true };
}

/** One paragraph: kept whole when it fits a fresh page, else split line by line so nothing runs off a page. */
function notePara(ctx: Ctx, c: NoteCursor, p: NotePara): NoteCursor {
  const font = p.header ? ctx.bold : ctx.font;
  const lines = wrapText(p.text, font, NOTES.size, NOTES.width);
  let cur = c;
  const whole = (cur.fresh || !p.header ? 0 : NOTES.gap) + lines.length * NOTES.lh;
  const fitsAPage = lines.length * NOTES.lh <= NOTES.contBottom - NOTES.contTop;
  if (!cur.fresh && cur.top + whole > cur.bottom && fitsAPage) cur = notesPage(ctx);
  if (!cur.fresh && p.header) cur.top += NOTES.gap;
  for (const line of lines) {
    if (cur.top + NOTES.lh > cur.bottom) cur = notesPage(ctx);
    text(ctx, cur.page, line, NOTES.x, cur.top, NOTES.size, font);
    cur.top += NOTES.lh;
  }
  cur.fresh = false;
  return cur;
}

function notes(ctx: Ctx, first: PDFPage): void {
  const paras = [
    ...noteParagraphs(ctx.input.day['ior_notes'] ?? ''),
    ...ctx.input.inspections.map((t) => t.trim()).filter((t) => t !== '').map((t) => ({ text: t, header: false })),
  ];
  let c: NoteCursor = { page: first, top: NOTES.firstTop, bottom: NOTES.firstBottom, fresh: true };
  for (const p of paras) c = notePara(ctx, c, p);
}

// ---------------------------------------------------------------------------------------------------------------------
// Signature line, footer (page 1)
// ---------------------------------------------------------------------------------------------------------------------

function signatureLine(ctx: Ctx, page: PDFPage): void {
  text(ctx, page, 'x', 36, 700.2, 10, ctx.font);
  page.drawLine({ start: { x: 44, y: vy(710) }, end: { x: 216, y: vy(710) }, thickness: 1, color: INK });
  text(ctx, page, 'Project Inspector:', 38, 716.2, 10, ctx.bold);
  text(ctx, page, ctx.input.inspector, 120, 716.2, 10, ctx.bold);
}

/** The company's footer lines, centered; a long line shrinks to the page width. */
function footer(ctx: Ctx, page: PDFPage): void {
  const lines = (ctx.input.job['footer'] ?? '').split('\n').map((l) => pdfSafe(l).trim()).filter((l) => l !== '');
  const size = lines.length <= 2 ? 10 : 7;
  lines.forEach((line, i) => {
    const s = Math.min(size, (size * 520) / Math.max(ctx.font.widthOfTextAtSize(line, size), 1));
    centered(ctx, page, line, (lines.length <= 2 ? 738.2 : 734) + i * (size + 4), s, ctx.font);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------------------------------------------------

interface Slot {
  x: number;
  top: number;
  w: number;
  h: number;
}

const SLOTS: Record<1 | 2 | 4, readonly Slot[]> = {
  1: [{ x: 80, top: 200, w: 452, h: 450 }],
  2: [{ x: 80, top: 145, w: 452, h: 280 }, { x: 80, top: 450, w: 452, h: 280 }],
  4: [
    { x: 40, top: 145, w: 260, h: 280 },
    { x: 312, top: 145, w: 260, h: 280 },
    { x: 40, top: 450, w: 260, h: 280 },
    { x: 312, top: 450, w: 260, h: 280 },
  ],
};

function drawFitted(page: PDFPage, img: PDFImage, x: number, top: number, w: number, h: number): void {
  const scale = Math.min(w / img.width, h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  page.drawImage(img, { x: x + (w - sw) / 2, y: vy(top + h) + (h - sh) / 2, width: sw, height: sh });
}

/** Lines centered under a box, `size` pt, 1.25 leading. */
function captionLines(ctx: Ctx, page: PDFPage, lines: readonly string[], x: number, w: number, top: number, size: number): void {
  lines.forEach((line, i) => {
    text(ctx, page, line, x + (w - ctx.font.widthOfTextAtSize(line, size)) / 2, top + i * size * 1.25, size, ctx.font);
  });
}

async function embedPhoto(ctx: Ctx, p: VisPhoto): Promise<PDFImage> {
  const img = await embedImage(ctx.doc, p.bytes);
  if (!img) throw new PhotoReadError(ctx.input.photos.indexOf(p));
  return img;
}

/** Title and time on one line, as the caption under a photo on Site Photos. */
function captionOf(p: VisPhoto): string {
  return [p.caption.trim(), p.time.trim()].filter((s) => s !== '').join(' · ');
}

/** "Site Photos": each photo fitted in its slot, its caption centered under it; a long caption takes room from the
 *  photo, never cut. */
async function sitePhotos(ctx: Ctx, list: readonly VisPhoto[]): Promise<void> {
  const per = ctx.input.photosPerPage;
  for (let i = 0; i < list.length; i += per) {
    const page = addTitledPage(ctx, 'Site Photos');
    for (let j = 0; j < per && i + j < list.length; j++) {
      const p = list[i + j] as VisPhoto;
      const s = SLOTS[per][j] as Slot;
      const caption = captionOf(p);
      const lines = caption === '' ? [] : wrapText(caption, ctx.font, 9, s.w);
      const extra = Math.max(0, lines.length - 1) * 11.25;
      drawFitted(page, await embedPhoto(ctx, p), s.x, s.top, s.w, s.h - extra);
      captionLines(ctx, page, lines, s.x, s.w, s.top + s.h - extra + 8, 9);
    }
  }
}

/** Photo Analysis: two rows a page, the photo left (its time under it) and its title and description beside it. */
const A = { top: 150, bottom: 748, rowH: 250, gap: 36, photoX: 40, photoW: 232, textX: 290, textW: 286, size: 9, lh: 12.5, title: 10.5, titleLh: 14 };

interface AnalysisCursor {
  page: PDFPage | null;
  top: number;
}

interface TextLine {
  text: string;
  bold: boolean;
  size: number;
  lh: number;
}

function analysisPage(ctx: Ctx, c: AnalysisCursor): PDFPage {
  c.page = addTitledPage(ctx, 'Photo Analysis');
  c.top = A.top;
  return c.page;
}

/** The text beside a photo: its title in bold, a little space, then the description. */
function besideLines(ctx: Ctx, p: VisPhoto): TextLine[] {
  const title = p.caption.trim() === '' ? [] : wrapText(p.caption.trim(), ctx.bold, A.title, A.textW);
  return [
    ...title.map((text) => ({ text, bold: true, size: A.title, lh: A.titleLh })),
    ...(title.length > 0 ? [{ text: '', bold: false, size: 0, lh: 4 }] : []),
    ...wrapText(p.description.trim(), ctx.font, A.size, A.textW).map((text) => ({ text, bold: false, size: A.size, lh: A.lh })),
  ];
}

/** One described photo. Its text runs down beside and below the photo, onto the next page when it is long. */
async function analysisRow(ctx: Ctx, c: AnalysisCursor, p: VisPhoto): Promise<void> {
  let page = c.page && c.top + A.rowH <= A.bottom ? c.page : analysisPage(ctx, c);
  const rowTop = c.top;
  const time = p.time.trim() === '' ? [] : wrapText(p.time.trim(), ctx.font, 8, A.photoW);
  const timeH = time.length === 0 ? 0 : time.length * 10 + 4;
  drawFitted(page, await embedPhoto(ctx, p), A.photoX, rowTop, A.photoW, A.rowH - timeH);
  captionLines(ctx, page, time, A.photoX, A.photoW, rowTop + A.rowH - timeH + 4, 8);
  let y = rowTop;
  let samePage = true;
  for (const l of besideLines(ctx, p)) {
    if (y + l.lh > A.bottom) {
      page = analysisPage(ctx, c);
      y = c.top;
      samePage = false;
    }
    text(ctx, page, l.text, A.textX, y, l.size, l.bold ? ctx.bold : ctx.font);
    y += l.lh;
  }
  c.top = (samePage ? Math.max(rowTop + A.rowH, y) : y) + A.gap;
}

// ---------------------------------------------------------------------------------------------------------------------

function pageNumbers(ctx: Ctx): void {
  const n = ctx.pages.length;
  if (n <= 1) return;
  ctx.pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${n}`;
    text(ctx, page, label, RM - ctx.font.widthOfTextAtSize(label, 7), 760, 7, ctx.font);
  });
}

/** Builds the VIS daily report PDF. Throws FormFitError for a table value too long for its cell, PhotoReadError for a
 *  photo that isn't a readable JPEG or PNG, and an Error for a logo that isn't one. */
export async function buildVisPdf(input: VisPdfInput, onText?: (t: DrawnText) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Daily Report - ${input.job['project_name'] ?? ''} - ${input.date}`));
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const logo = input.logo ? await embedImage(doc, input.logo) : null;
  if (input.logo && !logo) throw new Error('The company logo could not be read. Upload it again as a PNG or JPEG.');
  const first = doc.addPage([PW, PH]);
  const ctx: Ctx = { doc, font, bold, logo, pages: [first], input, onText };

  drawLogo(ctx, first);
  box(first, LM, 85.76, 540, 26);
  centered(ctx, first, `${input.year} Project Inspector’s Daily Report`, 93.9, 14, bold);
  table(ctx, first);
  text(ctx, first, 'IOR Notes:', 39, 291, 10, bold);
  box(first, LM, 303.76, 540, 372.24);
  signatureLine(ctx, first);
  footer(ctx, first);
  notes(ctx, first);

  await sitePhotos(ctx, input.photos.filter((p) => p.description.trim() === ''));
  const cursor: AnalysisCursor = { page: null, top: A.top };
  for (const p of input.photos.filter((x) => x.description.trim() !== '')) await analysisRow(ctx, cursor, p);

  pageNumbers(ctx);
  return doc.save();
}

/** When a photo was taken, as the form's captions print it: "Mon, Sep 28, 2026 at 9:14 AM" in the job's zone. */
export function visPhotoTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

/** A calendar day (yyyy-MM-dd) as the VIS form prints it ("9/28/2026"), and its year. */
export function visDate(day: string): { date: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Not a calendar day: ${day}`);
  const [, y = '', mo = '', d = ''] = m;
  return { date: `${Number(mo)}/${Number(d)}/${y}`, year: y };
}
