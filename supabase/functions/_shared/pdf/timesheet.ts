// The monthly timesheet (SPEC §15): MDR's VIS timesheet layout rebuilt as a pure PDF builder. Data in, bytes out
// (pdf-lib, standard fonts, landscape Letter). Rendered only on the server (the timesheets function) from saved hours;
// the signature goes on afterwards through the ONE stamp (stamp.ts) at the spot this returns.
//
// Top: the company logo, IOR and client, the month end date. The grid: a column per day (weekends shaded), a row pair
// per job (Regular / OT), totals per job and per day; seven jobs a page, more go on further pages. Then the summary
// (total / regular / OT) and the contract table (Contract / Used / Remaining, an overrun in red), the signature and date
// lines, and the company's footer. The logo and footer are the company's data, passed in; nothing about any company
// is in this file. Nothing is cut off: a long job name shrinks and wraps to its cell.
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { type BudgetRow, formatHours, monthSpan, type MonthProject, weekdayOf } from '../timesheet.ts';
import { pdfSafe, wrapText } from './inspectionReport.ts';
import type { StampSpot } from './stamp.ts';

export interface TimesheetPdfInput {
  /** Printed after "IOR:". */
  inspector: string;
  /** "Multiple Projects", or the one job's name. */
  client: string;
  /** yyyy-MM */
  month: string;
  /** Jobs with hours this month (lib monthGrid); all hours are regular hours. */
  projects: readonly MonthProject[];
  /** My contract hours per job (lib computeBudgets through the end of the month). */
  budgets: readonly BudgetRow[];
  /** The company logo (PNG or JPEG), or null. */
  logo: Uint8Array | null;
  /** The company's footer (address, phone), up to two lines; '' for none. */
  footer: string;
  /** Printed on the Date line: the signing day, e.g. "9/30/2026". */
  signedOn: string;
}

export interface TimesheetPdf {
  bytes: Uint8Array;
  /** Where the stamp signs: the last page's signature line. */
  signAt: StampSpot;
}

type Color = ReturnType<typeof rgb>;

const PW = 792;
const PH = 612;
const LEFT = 16;
const RIGHT = PW - 16;
const NAME_W = 130;
const TYPE_W = 38;
const TOTAL_W = 42;
const ROW = 14;
const HEAD_ROW = 16;
const JOBS_PER_PAGE = 7;
const SIGN_TOP = PH - 50;
const BOTTOM = SIGN_TOP - 40;

const HEAD = rgb(0.522, 0.094, 0.094);
const HEAD_WEEKEND = rgb(0.4, 0.07, 0.07);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(0.949, 0.949, 0.949);
const TOTALS = rgb(0.812, 0.886, 0.953);
const WEEKEND = rgb(0.95, 0.92, 0.88);
const INK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const OVERRUN = rgb(0.7, 0, 0);
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Drawing on one page with top-down coordinates (y = distance from the top edge). */
class Sheet {
  constructor(
    readonly page: PDFPage,
    readonly f: Fonts,
  ) {}

  text(s: string, x: number, top: number, size: number, font: PDFFont = this.f.regular, color: Color = INK): void {
    if (s === '') return;
    this.page.drawText(pdfSafe(s).replace(/\n/g, ' '), { x, y: PH - top - size, size, font, color });
  }

  center(s: string, x: number, w: number, top: number, size: number, font: PDFFont = this.f.regular, color: Color = INK): void {
    const t = pdfSafe(s);
    this.text(t, x + (w - font.widthOfTextAtSize(t, size)) / 2, top, size, font, color);
  }

  fill(x: number, top: number, w: number, h: number, color: Color): void {
    this.page.drawRectangle({ x, y: PH - top - h, width: w, height: h, color });
  }

  box(x: number, top: number, w: number, h: number): void {
    this.page.drawRectangle({ x, y: PH - top - h, width: w, height: h, borderColor: INK, borderWidth: 0.3 });
  }

  line(x1: number, top: number, x2: number, width = 0.5): void {
    this.page.drawLine({ start: { x: x1, y: PH - top }, end: { x: x2, y: PH - top }, thickness: width, color: INK });
  }

  /** Text shrunk (then wrapped) to fit a cell; the last resort ends in "...". */
  fit(s: string, x: number, top: number, w: number, h: number, sizes: readonly number[], font: PDFFont): void {
    for (const size of sizes) {
      const lines = wrapText(s, font, size, w);
      if (lines.length * (size + 1) <= h) {
        const start = top + (h - lines.length * (size + 1)) / 2;
        lines.forEach((l, i) => this.text(l, x, start + i * (size + 1), size, font));
        return;
      }
    }
    const size = sizes[sizes.length - 1] ?? 5;
    const max = Math.max(1, Math.floor(h / (size + 1)));
    const lines = wrapText(s, font, size, w).slice(0, max);
    const last = lines.length - 1;
    lines[last] = `${(lines[last] ?? '').replace(/.{0,3}$/, '')}...`;
    lines.forEach((l, i) => this.text(l, x, top + i * (size + 1), size, font));
  }
}

interface Grid {
  days: number;
  dayW: number;
  dayX: number;
  totalX: number;
  year: number;
  monthNo: number;
}

function gridOf(month: string): Grid {
  const span = monthSpan(month);
  const dayW = Math.floor((RIGHT - LEFT - NAME_W - TYPE_W - TOTAL_W) / span.days);
  const dayX = LEFT + NAME_W + TYPE_W;
  return { days: span.days, dayW, dayX, totalX: dayX + dayW * span.days, year: span.year, monthNo: span.monthNo };
}

function weekend(g: Grid, d: number): boolean {
  const w = weekdayOf(`${String(g.year)}-${String(g.monthNo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return w === 0 || w === 6;
}

function monthLabel(g: Grid): string {
  const name = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(g.year, g.monthNo - 1, 1)));
  return `${name} ${String(g.year)}`;
}

function header(s: Sheet, g: Grid, input: TimesheetPdfInput, logo: PDFImage | null): void {
  if (logo) {
    const scale = Math.min(100 / logo.width, 40 / logo.height);
    s.page.drawImage(logo, { x: LEFT, y: PH - 14 - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  }
  const tx = LEFT + 110;
  s.text('IOR:', tx, 16, 10, s.f.bold);
  s.text(input.inspector, tx + 28, 16, 10);
  s.text('Client:', tx, 30, 10, s.f.bold);
  s.text(input.client, tx + 38, 30, 10);
  const end = `${String(g.monthNo).padStart(2, '0')}/${String(g.days).padStart(2, '0')}/${String(g.year)}`;
  s.text('Month End Date', RIGHT - 140, 16, 9, s.f.bold);
  s.text(end, RIGHT - 140, 28, 9);
  s.text(monthLabel(g), RIGHT - 80, 42, 11, s.f.bold);

  s.fill(LEFT, 56, g.totalX + TOTAL_W - LEFT, 14, HEAD);
  s.text('REGULAR HOURS:', LEFT + 4, 59, 9, s.f.bold, WHITE);
  s.center('Total', g.totalX, TOTAL_W, 59, 8, s.f.bold, WHITE);

  s.fill(LEFT, 70, NAME_W + TYPE_W, HEAD_ROW + ROW, HEAD);
  s.text('Date:', LEFT + 4, 74, 9, s.f.bold, WHITE);
  for (let d = 1; d <= g.days; d++) {
    const x = g.dayX + (d - 1) * g.dayW;
    const bg = weekend(g, d) ? HEAD_WEEKEND : HEAD;
    s.fill(x, 70, g.dayW, HEAD_ROW + ROW, bg);
    s.center(String(d), x, g.dayW, 74, 8, s.f.bold, WHITE);
    const w = weekdayOf(`${String(g.year)}-${String(g.monthNo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    s.center(WEEKDAYS[w] ?? '', x, g.dayW, 73 + HEAD_ROW, 7, s.f.bold, WHITE);
  }
  s.fill(g.totalX, 70, TOTAL_W, HEAD_ROW + ROW, HEAD);
  s.center('Totals', g.totalX, TOTAL_W, 74, 8, s.f.bold, WHITE);
}

/** A job's two rows (Regular, OT). All hours are regular: the OT row stays on the form, empty. */
function jobRows(s: Sheet, g: Grid, top: number, job: MonthProject | null, alt: boolean): void {
  const bg = alt ? ZEBRA : WHITE;
  s.fill(LEFT, top, NAME_W, ROW * 2, bg);
  s.box(LEFT, top, NAME_W, ROW * 2);
  if (job) s.fit(job.name, LEFT + 3, top + 1, NAME_W - 6, ROW * 2 - 2, [7, 6.5, 6, 5.5, 5], s.f.bold);
  ['Regular', 'OT'].forEach((label, i) => {
    const y = top + i * ROW;
    s.fill(LEFT + NAME_W, y, TYPE_W, ROW, HEAD);
    s.center(label, LEFT + NAME_W, TYPE_W, y + 3.5, 6.5, s.f.bold, WHITE);
    for (let d = 1; d <= g.days; d++) {
      const x = g.dayX + (d - 1) * g.dayW;
      s.fill(x, y, g.dayW, ROW, weekend(g, d) ? WEEKEND : bg);
      s.box(x, y, g.dayW, ROW);
      const h = i === 0 ? (job?.days[d] ?? 0) : 0;
      if (h > 0) s.center(formatHours(h), x, g.dayW, y + 3.5, 7);
    }
    s.fill(g.totalX, y, TOTAL_W, ROW, ZEBRA);
    s.box(g.totalX, y, TOTAL_W, ROW);
    const total = i === 0 ? (job?.total ?? 0) : 0;
    if (total > 0) s.center(formatHours(total), g.totalX, TOTAL_W, y + 3.5, 7, s.f.bold);
  });
}

function dayTotals(s: Sheet, g: Grid, top: number, projects: readonly MonthProject[]): number {
  const h = ROW + 2;
  s.fill(LEFT, top, NAME_W + TYPE_W, h, TOTALS);
  s.box(LEFT, top, NAME_W + TYPE_W, h);
  s.text('Total Regular Hours:', LEFT + 3, top + 4, 8, s.f.bold);
  let grand = 0;
  for (let d = 1; d <= g.days; d++) {
    const x = g.dayX + (d - 1) * g.dayW;
    s.fill(x, top, g.dayW, h, TOTALS);
    s.box(x, top, g.dayW, h);
    const day = projects.reduce((sum, p) => sum + (p.days[d] ?? 0), 0);
    grand += day;
    if (day > 0) s.center(formatHours(day), x, g.dayW, top + 4.5, 7, s.f.bold);
  }
  s.fill(g.totalX, top, TOTAL_W, h, TOTALS);
  s.box(g.totalX, top, TOTAL_W, h);
  s.center(formatHours(grand), g.totalX, TOTAL_W, top + 4, 8, s.f.bold);
  return grand;
}

function summary(s: Sheet, top: number, total: number): number {
  const x = RIGHT - 200;
  const lw = 120;
  const vw = 60;
  s.fill(x, top, lw + vw, ROW, HEAD);
  s.text('Total Hours Worked', x + 4, top + 3, 8, s.f.bold, WHITE);
  s.center(formatHours(total), x + lw, vw, top + 3, 8, s.f.bold, WHITE);
  [['Regular', total], ['OT', 0]].forEach(([label, v], i) => {
    const y = top + ROW * (i + 1);
    s.fill(x, y, lw, ROW, HEAD);
    s.text(String(label), x + 4, y + 3, 8, s.f.bold, WHITE);
    s.fill(x + lw, y, vw, ROW, ZEBRA);
    s.box(x + lw, y, vw, ROW);
    s.center(formatHours(Number(v)), x + lw, vw, y + 3, 8, s.f.bold);
  });
  return top + ROW * 3;
}

const BUDGET_NAME_W = 160;
const BUDGET_COL_W = 60;

function budgetHeader(s: Sheet, top: number): void {
  s.fill(LEFT, top, BUDGET_NAME_W + BUDGET_COL_W * 3, ROW, HEAD);
  s.text('Project', LEFT + 4, top + 3, 8, s.f.bold, WHITE);
  ['Contract', 'Used', 'Remaining'].forEach((t, i) => {
    s.center(t, LEFT + BUDGET_NAME_W + BUDGET_COL_W * i, BUDGET_COL_W, top + 3, 8, s.f.bold, WHITE);
  });
}

function budgetRow(s: Sheet, top: number, b: BudgetRow, alt: boolean): void {
  const bg = alt ? ZEBRA : WHITE;
  s.fill(LEFT, top, BUDGET_NAME_W, ROW, bg);
  s.box(LEFT, top, BUDGET_NAME_W, ROW);
  s.fit(b.name, LEFT + 4, top + 1, BUDGET_NAME_W - 8, ROW - 2, [7, 6.5, 6, 5.5, 5], s.f.bold);
  [b.contract, b.used, b.remaining].forEach((v, i) => {
    const x = LEFT + BUDGET_NAME_W + BUDGET_COL_W * i;
    s.fill(x, top, BUDGET_COL_W, ROW, bg);
    s.box(x, top, BUDGET_COL_W, ROW);
    const last = i === 2;
    s.center(formatHours(v), x, BUDGET_COL_W, top + 3.5, 7, last ? s.f.bold : s.f.regular, last && v < 0 ? OVERRUN : INK);
  });
}

function signatureLines(s: Sheet, signedOn: string): void {
  s.line(LEFT + 10, SIGN_TOP, LEFT + 200);
  s.text('Inspector Signature', LEFT + 50, SIGN_TOP + 4, 8, s.f.regular, GRAY);
  s.center(signedOn, RIGHT - 180, 160, SIGN_TOP - 12, 9);
  s.line(RIGHT - 180, SIGN_TOP, RIGHT - 20);
  s.text('Date', RIGHT - 106, SIGN_TOP + 4, 8, s.f.regular, GRAY);
}

function footer(s: Sheet, text: string): void {
  const lines = pdfSafe(text).split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(0, 2);
  lines.forEach((l, i) => {
    s.center(l, 0, PW, PH - 26 + i * 9, 7, s.f.regular, GRAY);
  });
}

async function embedLogo(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  const png = bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
}

export async function buildTimesheet(input: TimesheetPdfInput): Promise<TimesheetPdf> {
  const doc = await PDFDocument.create();
  const f = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const logo = await embedLogo(doc, input.logo);
  const g = gridOf(input.month);
  const newPage = (withGrid: boolean): Sheet => {
    const s = new Sheet(doc.addPage([PW, PH]), f);
    if (withGrid) header(s, g, input, logo);
    footer(s, input.footer);
    return s;
  };

  // The grid: seven jobs a page (one empty row pair when the month has none).
  const jobs: (MonthProject | null)[] = input.projects.length > 0 ? [...input.projects] : [null];
  let s = newPage(true);
  let top = 70 + HEAD_ROW + ROW;
  jobs.forEach((job, i) => {
    if (i > 0 && i % JOBS_PER_PAGE === 0) {
      s = newPage(true);
      top = 70 + HEAD_ROW + ROW;
    }
    jobRows(s, g, top, job, i % 2 === 1);
    top += ROW * 2 + 2;
  });
  top += 4;
  const total = dayTotals(s, g, top, input.projects);
  top = summary(s, top + ROW + 8, total) + 10;

  // The contract table; rows that do not fit go on a further page.
  if (input.budgets.length > 0) {
    if (top + ROW * 2 > BOTTOM) {
      s = newPage(false);
      top = 40;
    }
    budgetHeader(s, top);
    top += ROW;
    input.budgets.forEach((b, i) => {
      if (top + ROW > BOTTOM) {
        s = newPage(false);
        top = 40;
        budgetHeader(s, top);
        top += ROW;
      }
      budgetRow(s, top, b, i % 2 === 1);
      top += ROW;
    });
  }

  signatureLines(s, input.signedOn);
  return {
    bytes: await doc.save(),
    signAt: { page: doc.getPageCount() - 1, x: LEFT + 12, y: PH - SIGN_TOP + 2, width: 188, height: 28 },
  };
}
