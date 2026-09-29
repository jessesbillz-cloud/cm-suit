// A person's monthly invoice (SPEC §15): MDR's invoice layout rebuilt as a pure PDF builder. Data in, bytes out
// (pdf-lib, standard fonts, Letter). Rendered only on the server (the timesheets function) from the invoice's saved
// snapshot (invoices.lines and its from / bill to / terms), never from anything typed in the browser.
//
// The letterhead (the person's business name, INVOICE), From / Bill to / the invoice's number, date, month and terms,
// one line per job (month, job, DSA # when any job has one, hours, rate, amount), a subtotal per rate when there is
// more than one, and the total hours and total due. A long job name wraps in its row; many jobs continue on further
// pages with the table header repeated. Nothing about any person or company is in this file.
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { formatHours } from '../timesheet.ts';
import { pdfSafe, wrapText } from './inspectionReport.ts';

export interface InvoiceLine {
  job: string;
  dsa: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface InvoicePdfInput {
  fromName: string;
  fromAddress: string;
  billTo: string;
  terms: string;
  number: number;
  /** The invoice date as printed, e.g. "9/28/2026". */
  issuedOn: string;
  /** The billing month, e.g. "September 2026". */
  monthLabel: string;
  lines: readonly InvoiceLine[];
  totalHours: number;
  totalAmount: number;
}

type Color = ReturnType<typeof rgb>;

const PW = 612;
const PH = 792;
const LM = 40;
const RM = 572;
const BOTTOM = 730;
const INK = rgb(0.13, 0.15, 0.18);
const ACCENT = rgb(0.145, 0.388, 0.922);
const ZEBRA = rgb(0.955, 0.955, 0.958);
const LINE = rgb(0.8, 0.82, 0.84);
const MUTED = rgb(0.38, 0.38, 0.38);
const WHITE = rgb(1, 1, 1);

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Dollars as printed: "$1,305.00". */
export function money(n: number): string {
  return MONEY.format(n);
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Columns: x of each left edge; amount is right-aligned to RM - 6. The DSA column is there only when used. */
interface Cols {
  month: number;
  job: number;
  jobW: number;
  dsa: number | null;
  hours: number;
  rate: number;
}

function colsOf(withDsa: boolean): Cols {
  return withDsa
    ? { month: 46, job: 90, jobW: 170, dsa: 268, hours: 384, rate: 448 }
    : { month: 46, job: 90, jobW: 285, dsa: null, hours: 384, rate: 448 };
}

class Paper {
  constructor(
    readonly page: PDFPage,
    readonly f: Fonts,
  ) {}

  text(s: string, x: number, top: number, size: number, font: PDFFont = this.f.regular, color: Color = INK): void {
    const t = pdfSafe(s).replace(/\n/g, ' ');
    if (t === '') return;
    this.page.drawText(t, { x, y: PH - top - size, size, font, color });
  }

  right(s: string, xr: number, top: number, size: number, font: PDFFont = this.f.regular, color: Color = INK): void {
    const t = pdfSafe(s);
    this.text(t, xr - font.widthOfTextAtSize(t, size), top, size, font, color);
  }

  fill(x: number, top: number, w: number, h: number, color: Color): void {
    this.page.drawRectangle({ x, y: PH - top - h, width: w, height: h, color });
  }

  box(x: number, top: number, w: number, h: number, color: Color = LINE): void {
    this.page.drawRectangle({ x, y: PH - top - h, width: w, height: h, borderColor: color, borderWidth: 0.5 });
  }
}

/** Non-empty lines of a multi-line block. */
function linesOf(block: string): string[] {
  return block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
}

function letterhead(p: Paper, input: InvoicePdfInput): number {
  const nameLines = wrapText(input.fromName.toUpperCase(), p.f.bold, 19, 330);
  nameLines.forEach((l, i) => p.text(l, LM, 30 + i * 22, 19, p.f.bold));
  p.right('INVOICE', RM, 28, 27, p.f.bold, ACCENT);
  const rule = Math.max(70, 30 + nameLines.length * 22 + 8);
  p.fill(LM, rule, RM - LM, 2, ACCENT);
  return rule + 16;
}

function parties(p: Paper, input: InvoicePdfInput, top: number): number {
  p.text('FROM', LM, top, 9, p.f.bold, MUTED);
  let fy = top + 14;
  for (const l of wrapText(input.fromName, p.f.bold, 10.5, 180)) {
    p.text(l, LM, fy, 10.5, p.f.bold);
    fy += 13;
  }
  for (const l of linesOf(input.fromAddress).flatMap((x) => wrapText(x, p.f.regular, 9.5, 180))) {
    p.text(l, LM, fy, 9.5);
    fy += 12;
  }

  const bx = 240;
  p.text('BILL TO', bx, top, 9, p.f.bold, MUTED);
  let by = top + 14;
  linesOf(input.billTo).forEach((l, i) => {
    for (const w of wrapText(l, i === 0 ? p.f.bold : p.f.regular, i === 0 ? 10.5 : 9.5, 170)) {
      p.text(w, bx, by, i === 0 ? 10.5 : 9.5, i === 0 ? p.f.bold : p.f.regular);
      by += 13;
    }
  });

  const meta: [string, string][] = [
    ['INVOICE #', String(input.number)],
    ['DATE', input.issuedOn],
    ['BILLING FOR', input.monthLabel],
    ...(input.terms.trim() !== '' ? ([['TERMS', input.terms.trim()]] as [string, string][]) : []),
  ];
  meta.forEach(([k, v], i) => {
    p.text(k, 430, top + i * 15, 9, p.f.bold, MUTED);
    p.right(v, RM, top + i * 15, 10);
  });
  return Math.max(fy, by, top + meta.length * 15) + 18;
}

function tableHead(p: Paper, c: Cols, top: number): number {
  p.fill(LM, top, RM - LM, 22, INK);
  p.text('MONTH', c.month, top + 7, 9.5, p.f.bold, WHITE);
  p.text('PROJECT', c.job, top + 7, 9.5, p.f.bold, WHITE);
  if (c.dsa !== null) p.text('DSA APP #', c.dsa, top + 7, 9.5, p.f.bold, WHITE);
  p.text('HOURS', c.hours, top + 7, 9.5, p.f.bold, WHITE);
  p.text('RATE', c.rate, top + 7, 9.5, p.f.bold, WHITE);
  p.right('AMOUNT', RM - 6, top + 7, 9.5, p.f.bold, WHITE);
  return top + 22;
}

function lineRow(p: Paper, c: Cols, top: number, line: InvoiceLine, month: string, alt: boolean): number {
  const jobLines = wrapText(line.job, p.f.regular, 10, c.jobW);
  const dsaLines = c.dsa === null ? [] : wrapText(line.dsa, p.f.regular, 9.5, c.hours - c.dsa - 10);
  const h = Math.max(22, Math.max(jobLines.length, dsaLines.length) * 12 + 10);
  if (alt) p.fill(LM, top, RM - LM, h, ZEBRA);
  p.box(LM, top, RM - LM, h);
  p.text(month, c.month, top + 7, 9.5);
  jobLines.forEach((l, i) => p.text(l, c.job, top + 7 + i * 12, 10));
  if (c.dsa !== null) dsaLines.forEach((l, i) => p.text(l, c.dsa ?? 0, top + 7 + i * 12, 9.5));
  p.text(formatHours(line.hours), c.hours, top + 7, 10);
  p.text(money(line.rate), c.rate, top + 7, 9.5, p.f.regular, MUTED);
  p.right(money(line.amount), RM - 6, top + 7, 10);
  return top + h;
}

/** "Total @ $90.00" lines, when the jobs are billed at more than one rate. */
function rateTiers(p: Paper, c: Cols, top: number, lines: readonly InvoiceLine[]): number {
  const tiers = new Map<number, number>();
  for (const l of lines) tiers.set(l.rate, (tiers.get(l.rate) ?? 0) + l.hours);
  if (tiers.size < 2) return top;
  let y = top + 6;
  for (const [rate, hours] of [...tiers].sort((a, b) => a[0] - b[0])) {
    p.text(`Total @ ${money(rate)}`, c.dsa ?? 268, y + 5, 9.5, p.f.bold, MUTED);
    p.text(`${formatHours(hours)} hrs`, c.hours, y + 5, 9.5, p.f.bold);
    p.right(money(Math.round(hours * rate * 100) / 100), RM - 6, y + 5, 9.5, p.f.bold);
    y += 17;
  }
  return y;
}

function totals(p: Paper, top: number, input: InvoicePdfInput): void {
  const h = 32;
  const lx = 250;
  p.fill(lx, top, RM - lx, h, INK);
  p.text('TOTAL DUE', lx + 12, top + 10, 11, p.f.bold, WHITE);
  p.right(money(input.totalAmount), RM - 12, top + 9, 14, p.f.bold, WHITE);
  p.box(LM, top, lx - LM - 10, h);
  p.text('TOTAL HOURS', LM + 12, top + 7, 9, p.f.bold, MUTED);
  p.right(formatHours(input.totalHours), lx - 22, top + 8, 13, p.f.bold);
}

function footers(doc: PDFDocument, f: Fonts, name: string): void {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const p = new Paper(page, f);
    p.fill(LM, 748, RM - LM, 0.75, LINE);
    const t = pdfSafe(name).replace(/\n/g, ' ');
    p.text(t, (PW - f.regular.widthOfTextAtSize(t, 8.5)) / 2, 754, 8.5, f.regular, MUTED);
    if (pages.length > 1) p.right(`Page ${String(i + 1)} of ${String(pages.length)}`, RM, 766, 7.5, f.regular, MUTED);
  });
}

export async function buildInvoice(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const c = colsOf(input.lines.some((l) => l.dsa.trim() !== ''));
  const month = (input.monthLabel.split(' ')[0] ?? '').slice(0, 3);

  let p = new Paper(doc.addPage([PW, PH]), f);
  let y = tableHead(p, c, parties(p, input, letterhead(p, input)));
  input.lines.forEach((line, i) => {
    const need = Math.max(22, wrapText(line.job, f.regular, 10, c.jobW).length * 12 + 10);
    if (y + need > BOTTOM) {
      p = new Paper(doc.addPage([PW, PH]), f);
      y = tableHead(p, c, 40);
    }
    y = lineRow(p, c, y, line, i === 0 ? month : '', i % 2 === 1);
  });
  const tierCount = new Set(input.lines.map((l) => l.rate)).size;
  if (y + (tierCount > 1 ? tierCount * 17 + 6 : 0) + 42 > BOTTOM) {
    p = new Paper(doc.addPage([PW, PH]), f);
    y = 40;
  }
  y = rateTiers(p, c, y, input.lines);
  totals(p, y + 10, input);
  footers(doc, f, input.fromName);
  return doc.save();
}
