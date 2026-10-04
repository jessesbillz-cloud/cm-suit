// The sign-in sheet of a tailgate safety meeting or a job meeting (migration 0060): the paper the super used to turn in
// to the safety guy. Pure: data in, bytes out (pdf-lib, standard fonts). The job and the meeting at the top, the topic
// as it was read (its points, the questions, the regulation it rests on), then everyone on the sheet with their company
// and trade, the time they signed and their signature drawn from its strokes; a member the leader ticked in says so.
// Letter portrait; overflow flows onto continuation pages and long names wrap in their cell, never cut off.
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { pdfSafe, wrapText } from './inspectionReport.ts';

/** A signature as stored: strokes of [x, y] points, fractions 0..1 of a pad twice as wide as tall, origin top-left. */
export type SignatureStrokes = readonly (readonly (readonly [number, number])[])[];

export interface SheetAttendee {
  name: string;
  company: string;
  trade: string;
  /** "7:42 AM" (the job's zone), or null for a member ticked in who did not sign. */
  timeLabel: string | null;
  signature: SignatureStrokes | null;
  /** Ticked in by this person (no signature of their own). */
  tickedBy: string | null;
}

export interface SafetySheetInput {
  job: { name: string; number: string | null };
  /** "Tailgate" or "Meeting". */
  kindLabel: string;
  number: number;
  /** "Mon, Oct 5, 2026". */
  dayLabel: string;
  title: string;
  leader: string;
  location: string;
  points: readonly string[];
  questions: readonly string[];
  notes: string;
  source: string | null;
  sourceUrl: string | null;
  /** "Oct 5, 2026, 7:42 AM PDT by Sol Super". */
  closedLabel: string;
  attendees: readonly SheetAttendee[];
}

const SIZE: [number, number] = [612, 792];
const MARGIN = 44;
const WIDTH = SIZE[0] - 2 * MARGIN;
/** Kept clear at the bottom of every page for the page line. */
const BOTTOM = 56;
const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const HEAD = rgb(0.96, 0.97, 0.98);

/** The attendance table: number, name, company and trade, time, signature (a 2:1 box). */
const ROW_H = 40;
const SIG_H = 32;
const SIG_W = SIG_H * 2;
const COLS = { n: 0, name: 22, company: 186, time: 352, sig: 410 } as const;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** The writing position. A new page starts when the next piece would reach the kept-clear bottom. */
class Cursor {
  page: PDFPage;
  y: number;
  constructor(readonly doc: PDFDocument, readonly fonts: Fonts, readonly heading: string) {
    this.page = doc.addPage(SIZE);
    this.y = SIZE[1] - MARGIN;
  }

  /** True when a new page was started. */
  need(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.page = this.doc.addPage(SIZE);
    this.y = SIZE[1] - MARGIN;
    for (const line of wrapText(this.heading, this.fonts.bold, 9, WIDTH)) {
      this.page.drawText(line, { x: MARGIN, y: this.y - 9, size: 9, font: this.fonts.bold, color: GRAY });
      this.y -= 13;
    }
    this.y -= 11;
    return true;
  }

  text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; hang?: string } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    for (const [i, line] of wrapText(value, font, size, WIDTH - indent).entries()) {
      this.need(size + 4);
      if (i === 0 && opts.hang) {
        this.page.drawText(opts.hang, { x: MARGIN + indent - 12, y: this.y - size, size, font: this.fonts.bold, color: GRAY });
      }
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
    this.gap(8);
    this.text(title.toUpperCase(), { size: 8, bold: true, color: GRAY });
    this.gap(2);
  }
}

/** One line, cut to a width with "..." (the page line only; every cell of the record wraps instead). */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  const safe = pdfSafe(text).replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let cut = safe.length;
  while (cut > 1 && font.widthOfTextAtSize(`${safe.slice(0, cut)}...`, size) > width) cut -= 1;
  return `${safe.slice(0, cut)}...`;
}

/** A cell's text wrapped to its width (nothing for an empty value). */
function cellLines(text: string, font: PDFFont, size: number, width: number): string[] {
  return text.trim() === '' ? [] : wrapText(text.trim(), font, size, width);
}

/** Draws a signature's strokes into a box whose top-left corner is (x, top). */
export function drawSignature(page: PDFPage, strokes: SignatureStrokes, x: number, top: number, w: number, h: number): void {
  const at = ([px, py]: readonly [number, number]) => ({ x: x + px * w, y: top - py * h });
  for (const stroke of strokes) {
    const first = stroke[0];
    if (!first) continue;
    if (stroke.length === 1) {
      page.drawCircle({ ...at(first), size: 0.7, color: INK });
      continue;
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      if (a && b) page.drawLine({ start: at(a), end: at(b), thickness: 1.1, color: INK });
    }
  }
}

function tableHead(c: Cursor): void {
  const { page, fonts } = c;
  page.drawRectangle({ x: MARGIN, y: c.y - 16, width: WIDTH, height: 16, color: HEAD });
  const head: [number, string][] = [
    [COLS.n, '#'], [COLS.name, 'Name'], [COLS.company, 'Company / trade'], [COLS.time, 'Signed'], [COLS.sig, 'Signature'],
  ];
  for (const [x, label] of head) page.drawText(label, { x: MARGIN + x + 3, y: c.y - 11, size: 8, font: fonts.bold, color: GRAY });
  c.y -= 16;
}

function attendeeRow(c: Cursor, a: SheetAttendee, n: number): void {
  const { fonts } = c;
  const name = cellLines(a.name, fonts.bold, 10, COLS.company - COLS.name - 8);
  const company = cellLines(a.company, fonts.regular, 9, COLS.time - COLS.company - 8);
  const trade = cellLines(a.trade, fonts.regular, 8, COLS.time - COLS.company - 8);
  const ticked = !a.signature && a.tickedBy ? cellLines(`Ticked in by ${a.tickedBy}`, fonts.regular, 8, WIDTH - COLS.sig - 8) : [];
  // A row grows with a long name or company: nothing on the record is cut off.
  const textH = Math.max(name.length * 12, company.length * 11 + trade.length * 10, ticked.length * 10);
  const rowH = Math.max(ROW_H, textH + 16);
  if (c.need(rowH)) tableHead(c);
  const { page } = c;
  const top = c.y;
  const base = top - 15;
  page.drawText(String(n), { x: MARGIN + COLS.n + 3, y: base, size: 9, font: fonts.regular, color: GRAY });
  for (const [i, line] of name.entries()) {
    page.drawText(line, { x: MARGIN + COLS.name + 3, y: base - i * 12, size: 10, font: fonts.bold, color: INK });
  }
  for (const [i, line] of company.entries()) {
    page.drawText(line, { x: MARGIN + COLS.company + 3, y: base - i * 11, size: 9, font: fonts.regular, color: INK });
  }
  for (const [i, line] of trade.entries()) {
    page.drawText(line, { x: MARGIN + COLS.company + 3, y: base - company.length * 11 - i * 10, size: 8, font: fonts.regular, color: GRAY });
  }
  if (a.timeLabel) page.drawText(pdfSafe(a.timeLabel), { x: MARGIN + COLS.time + 3, y: base, size: 9, font: fonts.regular, color: INK });
  if (a.signature) drawSignature(page, a.signature, MARGIN + COLS.sig + 4, top - (ROW_H - SIG_H) / 2, SIG_W, SIG_H);
  for (const [i, line] of ticked.entries()) {
    page.drawText(line, { x: MARGIN + COLS.sig + 4, y: base - i * 10, size: 8, font: fonts.regular, color: GRAY });
  }
  page.drawLine({ start: { x: MARGIN, y: top - rowH }, end: { x: MARGIN + WIDTH, y: top - rowH }, thickness: 0.5, color: LINE });
  c.y -= rowH;
}

function header(c: Cursor, input: SafetySheetInput): void {
  const job = input.job.number ? `${input.job.name} (${input.job.number})` : input.job.name;
  c.text('SIGN-IN SHEET', { size: 8, bold: true, color: GRAY });
  c.gap(2);
  c.text(`${input.kindLabel} ${String(input.number)}: ${input.title}`, { size: 16, bold: true });
  c.gap(2);
  c.text([job, input.dayLabel, `Led by ${input.leader}`, input.location].filter((s) => s.trim() !== '').join('  ·  '), { size: 10, color: GRAY });
  c.text(`Closed ${input.closedLabel}`, { size: 9, color: GRAY });
  c.gap(4);
  c.rule();
}

function topic(c: Cursor, input: SafetySheetInput): void {
  if (input.points.length === 0 && input.questions.length === 0 && input.notes.trim() === '' && !input.source) return;
  c.section('Topic');
  for (const p of input.points) c.text(p, { indent: 12, hang: '•' });
  if (input.questions.length > 0) {
    c.gap(4);
    c.text('Discuss', { size: 9, bold: true, color: GRAY });
    for (const [i, q] of input.questions.entries()) c.text(q, { indent: 12, hang: `${String(i + 1)}.` });
  }
  if (input.notes.trim() !== '') {
    c.gap(4);
    c.text(input.notes);
  }
  if (input.source) {
    c.gap(4);
    c.text(`Source: ${input.source}${input.sourceUrl ? `  ${input.sourceUrl}` : ''}`, { size: 8, color: GRAY });
  }
}

function footers(doc: PDFDocument, fonts: Fonts, input: SafetySheetInput): void {
  const pages = doc.getPages();
  for (const [i, page] of pages.entries()) {
    const left = fit(`${input.kindLabel} ${String(input.number)}  ·  ${input.job.name}  ·  ${String(input.attendees.length)} on the sheet`,
      fonts.regular, 8, WIDTH - 80);
    page.drawText(left, { x: MARGIN, y: 28, size: 8, font: fonts.regular, color: GRAY });
    const right = `Page ${String(i + 1)} of ${String(pages.length)}`;
    page.drawText(right, { x: MARGIN + WIDTH - fonts.regular.widthOfTextAtSize(right, 8), y: 28, size: 8, font: fonts.regular, color: GRAY });
  }
}

export async function buildSafetySheet(input: SafetySheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${input.kindLabel} ${String(input.number)} sign-in sheet`));
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const c = new Cursor(doc, fonts, `${input.kindLabel} ${String(input.number)}: ${input.title} (continued)`);
  header(c, input);
  topic(c, input);
  c.section(`Attendance (${String(input.attendees.length)})`);
  if (input.attendees.length === 0) {
    c.text('Nobody signed in.', { color: GRAY });
  } else {
    c.need(16 + ROW_H);
    tableHead(c);
    for (const [i, a] of input.attendees.entries()) attendeeRow(c, a, i + 1);
  }
  footers(doc, fonts, input);
  return await doc.save();
}
