// The built-in daily forms made of fields and tables (reportForms.ts: the superintendent's daily and the foreman's daily)
// as a PDF (SPEC §13.1, §8.2). Pure: data in, bytes out (pdf-lib, standard fonts), drawn with the work log's page pieces
// (dailyReport.ts) so every daily reads alike. Rendered only on the server from the saved report (submit-daily); the ONE
// stamp (stamp.ts) signs the last page's corner afterwards, where room is kept for it.
//
// Order: the title block; the short fields on one line under their title ("Conditions: Clear · High: 78°F"); each table
// with its column titles (repeated on a new page) and a total under its count and hours; IR results the inspections
// module wrote; the long fields; the photos, 1/2/4 a page. Empty parts are left out. Nothing is cut off: cells and
// paragraphs wrap and flow onto further pages, and a word longer than its column is broken.
import type { DailyHeader, TableRow } from '../dailies.ts';
import { type FormColumn, type FormTable, type ReportForm, tablesOf } from '../reportForms.ts';
import {
  type Ctx, type DailyPdfPhoto, type DrawnText, clean, draw, finish, GRAY, heading, jobTitle, MARGIN, newCtx, paragraph,
  photoPages, rightText, room, rule, WIDTH, wrapText,
} from './dailyReport.ts';

export interface FormDailyPdfInput {
  form: ReportForm;
  header: DailyHeader;
  number: number;
  /** The report date as people read it, e.g. "Mon, Sep 28, 2026". */
  dateLabel: string;
  /** The day's values, every key present (reportForms dailyValues). */
  day: Readonly<Record<string, string>>;
  /** The day's tables (content.tables), by table key. */
  tables: Readonly<Record<string, readonly TableRow[]>>;
  /** IR results the inspections module wrote on the report (content.inspections). */
  inspections: readonly string[];
  photos: readonly DailyPdfPhoto[];
  photosPerPage: 1 | 2 | 4;
}

const CELL_SIZE = 9;
const CELL_LH = 12;
const HEAD_SIZE = 8.5;
const GAP = 8;

interface Placed {
  col: FormColumn;
  x: number;
  w: number;
}

/** Columns across the page by their weights. */
function placeColumns(table: FormTable): Placed[] {
  const total = table.columns.reduce((s, c) => s + (c.w ?? 1), 0);
  let x = MARGIN;
  return table.columns.map((col) => {
    const w = (WIDTH * (col.w ?? 1)) / total;
    const p = { col, x, w };
    x += w;
    return p;
  });
}

function cellText(row: TableRow, key: string): string {
  return (row.cells[key] ?? '').trim();
}

/** A number cell's value, or null (empty or not a number: printed as typed, never summed). */
function numberOf(text: string): number | null {
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function numberLabel(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function columnTitles(ctx: Ctx, placed: readonly Placed[]): void {
  const y = ctx.y - HEAD_SIZE;
  for (const p of placed) {
    const label = clean(ctx, p.col.label);
    if (p.col.number) rightText(ctx, label, p.x + p.w, y, HEAD_SIZE, ctx.bold, GRAY);
    else draw(ctx, label, p.x, y, HEAD_SIZE, ctx.bold, GRAY);
  }
  ctx.y -= 13;
  rule(ctx, 4);
}

function tableRows(ctx: Ctx, placed: readonly Placed[], rows: readonly TableRow[]): void {
  const again = () => {
    columnTitles(ctx, placed);
  };
  for (const row of rows) {
    const lines = placed.map((p) => wrapText(ctx.font, CELL_SIZE, clean(ctx, cellText(row, p.col.key)), Math.max(p.w - GAP, 20)));
    const n = Math.max(1, ...lines.map((l) => l.length));
    for (let i = 0; i < n; i++) {
      room(ctx, CELL_LH, again);
      const y = ctx.y - CELL_SIZE;
      placed.forEach((p, c) => {
        const text = lines[c]?.[i] ?? '';
        if (p.col.number) rightText(ctx, text, p.x + p.w, y, CELL_SIZE, ctx.font);
        else draw(ctx, text, p.x, y, CELL_SIZE, ctx.font);
      });
      ctx.y -= CELL_LH;
    }
    ctx.y -= 2;
    rule(ctx, 4);
  }
}

/** The total line under a table's count and hours (two rows or more, and some were typed). */
function totals(ctx: Ctx, placed: readonly Placed[], rows: readonly TableRow[]): void {
  if (rows.length < 2) return;
  const sums = placed.map((p) => {
    if (!p.col.number) return null;
    const values = rows.map((r) => numberOf(cellText(r, p.col.key))).filter((v): v is number => v !== null);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
  });
  if (sums.every((s) => s === null)) return;
  room(ctx, CELL_LH, () => {
    columnTitles(ctx, placed);
  });
  const y = ctx.y - CELL_SIZE;
  draw(ctx, 'Total', MARGIN, y, CELL_SIZE, ctx.bold);
  placed.forEach((p, i) => {
    const s = sums[i];
    if (s !== null && s !== undefined) rightText(ctx, numberLabel(s), p.x + p.w, y, CELL_SIZE, ctx.bold);
  });
  ctx.y -= CELL_LH;
}

function drawTable(ctx: Ctx, table: FormTable, rows: readonly TableRow[]): void {
  const filled = rows.filter((r) => table.columns.some((c) => cellText(r, c.key) !== ''));
  if (filled.length === 0) return;
  const placed = placeColumns(table);
  // The title, the column titles and a first row stay together.
  room(ctx, 20 + 17 + CELL_LH * 2);
  heading(ctx, table.label);
  columnTitles(ctx, placed);
  tableRows(ctx, placed, filled);
  totals(ctx, placed, filled);
  ctx.y -= 6;
}

/** The short fields as one line: "Conditions: Clear, Wind · High: 78°F · Low: 61°F". */
function shortLine(form: ReportForm, day: Readonly<Record<string, string>>): string {
  return form.daily
    .filter((f) => !f.multiline && (day[f.key] ?? '').trim() !== '')
    .map((f) => `${f.label}: ${(day[f.key] ?? '').trim()}${f.unit ?? ''}`)
    .join(' · ');
}

/** Builds the PDF of a form made of fields and tables. Throws PhotoReadError for a photo that can't be read. */
export async function buildFormDailyPdf(input: FormDailyPdfInput, onText?: (t: DrawnText) => void): Promise<Uint8Array> {
  const { form, header, day } = input;
  const ctx = await newCtx(`${header.label} #${input.number} - ${header.project_name}`, onText);
  jobTitle(ctx, header, input.number, input.dateLabel);
  ctx.y -= 4;
  rule(ctx);

  const short = shortLine(form, day);
  if (short !== '') {
    heading(ctx, form.shortTitle ?? 'Daily activity');
    paragraph(ctx, short, 10, ctx.font);
    ctx.y -= 6;
  }
  for (const table of tablesOf(form)) drawTable(ctx, table, input.tables[table.key] ?? []);
  const irs = input.inspections.map((t) => t.trim()).filter((t) => t !== '');
  if (irs.length > 0) {
    heading(ctx, 'Inspection reports');
    for (const t of irs) {
      paragraph(ctx, t, 10, ctx.font);
      ctx.y -= 4;
    }
  }
  for (const f of form.daily.filter((x) => x.multiline)) {
    const text = (day[f.key] ?? '').trim();
    if (text === '') continue;
    heading(ctx, f.label);
    paragraph(ctx, text, 10, ctx.font);
    ctx.y -= 6;
  }
  if (input.photos.length > 0) await photoPages(ctx, input.photos, input.photosPerPage);
  return finish(ctx, header, input.number, input.dateLabel);
}
