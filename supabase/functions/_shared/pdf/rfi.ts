// The RFI PDF (SPEC §14.1, §8.2): our clean format. Pure: data in, bytes out (pdf-lib, standard fonts). The job's
// company logo and name head it; DRAFT (before issue) or VOID runs across every page. Rendered only by the rfis function
// from saved content; the two signatures go on afterwards through the one stamp (stamp.ts), the originator's bottom
// left and the PM / PE's bottom right, so the bottom of every page is kept clear for them. Overflow flows onto
// continuation pages, never cut off.
import { degrees, PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { pdfSafe, wrapText } from './inspectionReport.ts';

/** Everything the PDF says (no bytes): what the stored PDF's key is made of. */
export interface RfiPdfText {
  orgName: string;
  job: { name: string; number: string | null; address: string | null };
  /** Null before issue. */
  number: number | null;
  mark: 'DRAFT' | 'VOID' | null;
  title: string;
  question: string;
  suggestion: string;
  refs: string;
  from: { name: string; company: string };
  to: string;
  sentLabel: string | null;
  issuedLabel: string | null;
  dueLabel: string | null;
  neededByLabel: string | null;
  costImpact: boolean | null;
  timeImpact: boolean | null;
  /** Photos the PDF can't show (not JPEG or PNG), by name. */
  otherPhotos: readonly string[];
  answer: { text: string; by: string; dateLabel: string; files: readonly string[] } | null;
  impactDays: number;
  claim: { cost: boolean; time: boolean; dateLabel: string; note: string | null; gcNote: string | null } | null;
}

export interface RfiPdfInput extends RfiPdfText {
  /** The company logo, PNG or JPEG. */
  logo: Uint8Array | null;
  /** JPEG or PNG bytes; anything else is refused. */
  photos: readonly Uint8Array[];
}

const SIZE: [number, number] = [612, 792];
const MARGIN = 48;
/** Kept clear at the bottom of every page for the two signature stamps and the page line. */
const BOTTOM = 112;
const WIDTH = SIZE[0] - 2 * MARGIN;
const LOGO_W = 150;
const LOGO_H = 48;
const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const AMBER = rgb(0.76, 0.35, 0.05);
const MARK = rgb(0.6, 0.62, 0.66);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function rfiLabel(number: number | null): string {
  return number === null ? 'RFI Draft' : `RFI ${String(number).padStart(3, '0')}`;
}

/** The writing position. A new page starts when the next piece would reach the kept-clear bottom. */
class Cursor {
  page: PDFPage;
  y: number;
  constructor(readonly doc: PDFDocument, readonly fonts: Fonts, readonly heading: string) {
    this.page = doc.addPage(SIZE);
    this.y = SIZE[1] - MARGIN;
  }

  need(height: number): void {
    if (this.y - height >= BOTTOM) return;
    this.page = this.doc.addPage(SIZE);
    this.y = SIZE[1] - MARGIN;
    this.page.drawText(this.heading, { x: MARGIN, y: this.y - 10, size: 9, font: this.fonts.bold, color: GRAY });
    this.y -= 28;
  }

  text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    for (const line of wrapText(value, font, size, WIDTH - indent)) {
      this.need(size + 4);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size + 4;
    }
  }

  gap(h: number): void {
    this.y -= h;
  }

  rule(): void {
    this.need(8);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + WIDTH, y: this.y }, thickness: 0.75, color: LINE });
    this.y -= 8;
  }

  section(title: string): void {
    this.need(40);
    this.gap(10);
    this.text(title.toUpperCase(), { size: 8, bold: true, color: GRAY });
    this.gap(2);
  }
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function embedImage(doc: PDFDocument, bytes: Uint8Array, what: string): Promise<PDFImage> {
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  if (isPng(bytes)) return doc.embedPng(bytes);
  return Promise.reject(new Error(`The ${what} is not a JPEG or PNG.`));
}

/** Logo and company name at the left; "Request for Information" and the number (or DRAFT) at the right. */
async function header(c: Cursor, input: RfiPdfInput): Promise<void> {
  const { bold } = c.fonts;
  const top = c.y;
  let x = MARGIN;
  let height = 40;
  if (input.logo) {
    const img = await embedImage(c.doc, input.logo, 'company logo');
    const scale = Math.min(LOGO_W / img.width, LOGO_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    c.page.drawImage(img, { x, y: top - h, width: w, height: h });
    x += w + 12;
    height = Math.max(height, h);
  }
  const nameLines = wrapText(input.orgName, bold, 12, WIDTH - (x - MARGIN) - 190);
  nameLines.slice(0, 3).forEach((line, i) => {
    c.page.drawText(line, { x, y: top - 14 - i * 15, size: 12, font: bold, color: INK });
  });
  const kind = 'REQUEST FOR INFORMATION';
  c.page.drawText(kind, { x: MARGIN + WIDTH - bold.widthOfTextAtSize(kind, 8), y: top - 10, size: 8, font: bold, color: GRAY });
  const label = input.number === null ? 'DRAFT' : rfiLabel(input.number);
  c.page.drawText(label, { x: MARGIN + WIDTH - bold.widthOfTextAtSize(label, 18), y: top - 32, size: 18, font: bold, color: INK });
  c.y = top - Math.max(height, nameLines.slice(0, 3).length * 15 + 4) - 10;
  c.rule();
  c.text([input.job.name, input.job.number].filter(Boolean).join(' · '), { size: 11, bold: true });
  if (input.job.address) c.text(input.job.address, { size: 9, color: GRAY });
  c.gap(6);
}

/** Label / value pairs in two columns. */
function fieldGrid(c: Cursor, fields: readonly [string, string][]): void {
  const colW = WIDTH / 2 - 8;
  for (let i = 0; i < fields.length; i += 2) {
    const pair = fields.slice(i, i + 2);
    const rows = pair.map(([, v]) => wrapText(v, c.fonts.regular, 10, colW));
    const height = 12 + Math.max(...rows.map((r) => r.length)) * 13 + 6;
    c.need(height);
    pair.forEach(([label], j) => {
      const x = MARGIN + j * (colW + 16);
      c.page.drawText(pdfSafe(label.toUpperCase()), { x, y: c.y - 8, size: 7.5, font: c.fonts.bold, color: GRAY });
      (rows[j] ?? []).forEach((line, k) => {
        c.page.drawText(line, { x, y: c.y - 22 - k * 13, size: 10, font: c.fonts.regular, color: INK });
      });
    });
    c.y -= height;
  }
}

function checkbox(c: Cursor, x: number, label: string, checked: boolean): number {
  const size = 9;
  const y = c.y - 11;
  c.page.drawRectangle({ x, y, width: size, height: size, borderColor: INK, borderWidth: 0.8 });
  if (checked) {
    c.page.drawLine({ start: { x: x + 2, y: y + 2 }, end: { x: x + size - 2, y: y + size - 2 }, thickness: 1.2, color: INK });
    c.page.drawLine({ start: { x: x + 2, y: y + size - 2 }, end: { x: x + size - 2, y: y + 2 }, thickness: 1.2, color: INK });
  }
  c.page.drawText(label, { x: x + size + 5, y: y + 1, size: 10, font: c.fonts.regular, color: INK });
  return x + size + 5 + c.fonts.regular.widthOfTextAtSize(label, 10) + 24;
}

function possibleImpact(c: Cursor, input: RfiPdfInput): void {
  c.section('Possible impact');
  c.need(18);
  const x = checkbox(c, MARGIN, 'Cost', input.costImpact === true);
  checkbox(c, x, 'Time', input.timeImpact === true);
  c.y -= 18;
}

async function photos(c: Cursor, input: RfiPdfInput): Promise<void> {
  if (input.photos.length === 0 && input.otherPhotos.length === 0) return;
  c.section('Photos');
  const cellW = (WIDTH - 16) / 2;
  const cellH = 200;
  for (let i = 0; i < input.photos.length; i += 2) {
    c.need(cellH + 12);
    for (let j = 0; j < 2 && i + j < input.photos.length; j += 1) {
      const img = await embedImage(c.doc, input.photos[i + j] as Uint8Array, 'photo');
      const scale = Math.min(cellW / img.width, cellH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      c.page.drawImage(img, { x: MARGIN + j * (cellW + 16) + (cellW - w) / 2, y: c.y - h, width: w, height: h });
    }
    c.y -= cellH + 12;
  }
  if (input.otherPhotos.length > 0) c.text(`Also attached: ${input.otherPhotos.join(', ')}`, { size: 9, color: GRAY });
}

function answer(c: Cursor, input: RfiPdfInput): void {
  if (input.answer === null && input.number === null) return;
  c.section('Answer');
  if (input.answer === null) {
    c.text('Awaiting answer.', { color: GRAY });
    return;
  }
  c.text(input.answer.text);
  c.gap(4);
  c.text(`Answered by ${input.answer.by} · ${input.answer.dateLabel}`, { size: 9, color: GRAY });
  if (input.answer.files.length > 0) c.text(`Attachments: ${input.answer.files.join(', ')}`, { size: 9, color: GRAY });
}

function impact(c: Cursor, input: RfiPdfInput): void {
  c.section('Impact');
  const claim = input.claim;
  if (claim !== null) {
    const what = [claim.cost ? 'Cost' : null, claim.time ? 'Time' : null].filter(Boolean).join(' and ');
    const lines = wrapText(`IMPACT CLAIMED: ${what} · ${claim.dateLabel}`, c.fonts.bold, 10, WIDTH - 20);
    const noteLines = claim.note ? wrapText(claim.note, c.fonts.regular, 10, WIDTH - 20) : [];
    const gcLines = claim.gcNote ? wrapText(`GC note: ${claim.gcNote}`, c.fonts.regular, 10, WIDTH - 20) : [];
    const h = 12 + lines.length * 14 + (noteLines.length + gcLines.length) * 13;
    c.need(h + 8);
    c.page.drawRectangle({ x: MARGIN, y: c.y - h, width: WIDTH, height: h, borderColor: AMBER, borderWidth: 1.5 });
    let y = c.y - 18;
    for (const l of lines) {
      c.page.drawText(l, { x: MARGIN + 10, y, size: 10, font: c.fonts.bold, color: AMBER });
      y -= 14;
    }
    for (const l of [...noteLines, ...gcLines]) {
      c.page.drawText(l, { x: MARGIN + 10, y, size: 10, font: c.fonts.regular, color: INK });
      y -= 13;
    }
    c.y -= h + 8;
  }
  c.text(`No claim of cost or time impact within ${input.impactDays} days of the answer means none is claimed.`,
    { size: 9, color: GRAY });
}

/** Page line on every page; DRAFT or VOID across each page. */
function finishPages(doc: PDFDocument, fonts: Fonts, input: RfiPdfInput): void {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawText(`${rfiLabel(input.number)} · Page ${i + 1} of ${pages.length}`, {
      x: MARGIN, y: 18, size: 8, font: fonts.regular, color: GRAY,
    });
    if (input.mark) {
      page.drawText(input.mark, { x: 170, y: 250, size: 110, font: fonts.bold, color: MARK, opacity: 0.14, rotate: degrees(35) });
    }
  });
}

export async function buildRfiPdf(input: RfiPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${rfiLabel(input.number)} ${input.title}`));
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const c = new Cursor(doc, fonts, pdfSafe(`${rfiLabel(input.number)} · ${input.job.name} (continued)`));

  await header(c, input);
  // "Needed by" only on an older RFI that has one: the answer is due by the contract ("Answer due", Jesse, Oct 5).
  const neededBy: [string, string][] = input.neededByLabel === null ? [] : [['Needed by', input.neededByLabel]];
  fieldGrid(c, [
    ['From', [input.from.name, input.from.company].filter(Boolean).join(', ')],
    ['To', input.to],
    ['Date sent', input.sentLabel ?? '-'],
    ['Date issued', input.issuedLabel ?? '-'],
    ['Answer due', input.dueLabel ?? '-'],
    ...neededBy,
    ['Reference', input.refs || '-'],
  ]);
  c.gap(4);
  c.text(input.title, { size: 14, bold: true });
  c.section('Question');
  c.text(input.question);
  if (input.suggestion.trim() !== '') {
    c.section('Suggestion');
    c.text(input.suggestion);
  }
  possibleImpact(c, input);
  await photos(c, input);
  answer(c, input);
  impact(c, input);
  finishPages(doc, fonts, input);
  return doc.save();
}
