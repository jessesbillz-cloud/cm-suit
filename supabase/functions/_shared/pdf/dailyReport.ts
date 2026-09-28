// The daily report PDF (SPEC §13.1, §8.2): the built-in work-log template. Pure: data in, bytes out (pdf-lib,
// standard fonts). Rendered only on the server from saved content (submit-daily); the signature stamp is added after,
// by the ONE stamp (stamp.ts), on the last page, where room is kept for it.
//
// Nothing is ever cut off: long cells and notes wrap and flow onto continuation pages (the table header repeats), words
// longer than a line are broken, and characters the standard fonts can't draw become '?' instead of failing.
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { type DailyContent, type DailyHeader, NOTE_SECTIONS } from '../dailies.ts';

export interface DailyPdfPhoto {
  bytes: Uint8Array;
  mime: string;
  caption: string;
  /** Job and time the photo was taken, e.g. "Sample Job A · Sep 26, 2026 4:05 PM PDT". */
  stamp: string;
  /** The work-log row it was taken from (company), or null. */
  rowLabel: string | null;
}

export interface DailyPdfInput {
  header: DailyHeader;
  number: number;
  /** The report date as people read it, e.g. "Mon, Sep 28, 2026". */
  dateLabel: string;
  content: DailyContent;
  photos: readonly DailyPdfPhoto[];
  photosPerPage: 1 | 2 | 4;
}

/** One piece of text as drawn: page (0-based) and baseline. For tests: proves nothing was dropped or drawn off-page. */
export interface DrawnText {
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
}

/** A photo the builder could not read (not a JPEG or PNG, or damaged). `index` is 0-based. */
export class PhotoReadError extends Error {
  constructor(readonly index: number) {
    super(`Photo ${index + 1} could not be read. Remove it and add it again.`);
  }
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const WIDTH = PAGE_W - 2 * MARGIN;
const TOP = PAGE_H - MARGIN;
const BOTTOM = 56;
const FOOTER_Y = 20;
/** Room kept at the bottom of the last page for the signature stamp (stamp.ts draws up to about 104pt). */
export const SIGN_SPACE = 118;
const GRAY = rgb(0.38, 0.38, 0.4);
const INK = rgb(0.1, 0.1, 0.12);
const RULE = rgb(0.85, 0.85, 0.87);

const COLS = { company: 140, crew: 44, hours: 50 };
const DESC_W = WIDTH - COLS.company - COLS.crew - COLS.hours;

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  charset: Set<number>;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  onText: ((t: DrawnText) => void) | undefined;
}

function addPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(ctx.page);
  ctx.y = TOP;
}

/** Text the standard fonts can draw: tabs become spaces, anything outside WinAnsi becomes '?'. */
function clean(ctx: Ctx, s: string): string {
  let out = '';
  for (const ch of s.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
    const cp = ch.codePointAt(0) ?? 63;
    out += ch === '\n' || ctx.charset.has(cp) ? ch : '?';
  }
  return out;
}

/** Breaks one long word into pieces that fit. */
function breakWord(font: PDFFont, size: number, word: string, width: number): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur !== '' && font.widthOfTextAtSize(cur + ch, size) > width) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur !== '') parts.push(cur);
  return parts;
}

/** Wraps already-cleaned text to a width. Newlines are kept; empty lines stay empty. Never drops a character. */
export function wrapText(font: PDFFont, size: number, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/).filter((w) => w !== '');
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let cur = '';
    for (const word of words) {
      const pieces = font.widthOfTextAtSize(word, size) > width ? breakWord(font, size, word, width) : [word];
      for (const piece of pieces) {
        const next = cur === '' ? piece : `${cur} ${piece}`;
        if (cur !== '' && font.widthOfTextAtSize(next, size) > width) {
          lines.push(cur);
          cur = piece;
        } else {
          cur = next;
        }
      }
    }
    lines.push(cur);
  }
  return lines;
}

function draw(ctx: Ctx, text: string, x: number, baseline: number, size: number, font: PDFFont, color = INK): void {
  if (text === '') return;
  ctx.page.drawText(text, { x, y: baseline, size, font, color });
  ctx.onText?.({ page: ctx.pages.length - 1, x, y: baseline, size, text });
}

/** Moves to a new page when `height` doesn't fit above the bottom margin; runs `onBreak` on the new page. */
function room(ctx: Ctx, height: number, onBreak?: () => void): void {
  if (ctx.y - height < BOTTOM) {
    addPage(ctx);
    onBreak?.();
  }
}

/** A wrapped paragraph, line by line (so it flows across pages). */
function paragraph(ctx: Ctx, text: string, size: number, font: PDFFont, color = INK, indent = 0): void {
  const lh = size * 1.3;
  for (const line of wrapText(font, size, clean(ctx, text), WIDTH - indent)) {
    room(ctx, lh);
    draw(ctx, line, MARGIN + indent, ctx.y - size, size, font, color);
    ctx.y -= lh;
  }
}

function rule(ctx: Ctx, gapAfter = 8): void {
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 0.6, color: RULE });
  ctx.y -= gapAfter;
}

function heading(ctx: Ctx, text: string): void {
  room(ctx, 16 + 14); // the heading never sits alone at the bottom of a page
  ctx.y -= 4;
  draw(ctx, clean(ctx, text), MARGIN, ctx.y - 11, 11, ctx.bold);
  ctx.y -= 16;
}

function titleBlock(ctx: Ctx, input: DailyPdfInput): void {
  const h = input.header;
  paragraph(ctx, `${h.label} #${input.number}`, 16, ctx.bold);
  paragraph(ctx, h.project_name, 12, ctx.bold);
  const job = [h.project_number ? `Job ${h.project_number}` : '', h.project_address].filter((s) => s !== '').join(' · ');
  if (job !== '') paragraph(ctx, job, 9, ctx.font, GRAY);
  const who = [h.author_name, h.author_company].filter((s) => s !== '').join(', ');
  paragraph(ctx, [input.dateLabel, who].filter((s) => s !== '').join(' · '), 10, ctx.font);
  if (input.content.weather.trim() !== '') paragraph(ctx, `Weather: ${input.content.weather.trim()}`, 10, ctx.font);
  ctx.y -= 4;
  rule(ctx);
  if (input.content.standing_note.trim() !== '') {
    paragraph(ctx, input.content.standing_note.trim(), 9, ctx.font, GRAY);
    ctx.y -= 4;
  }
}

function num(n: number | null): string {
  return n === null ? '' : String(Math.round(n * 100) / 100);
}

function tableHeader(ctx: Ctx): void {
  const size = 8.5;
  const y = ctx.y - size;
  draw(ctx, 'Company', MARGIN, y, size, ctx.bold, GRAY);
  draw(ctx, 'Description', MARGIN + COLS.company, y, size, ctx.bold, GRAY);
  rightText(ctx, 'Crew', MARGIN + COLS.company + DESC_W + COLS.crew, y, size, ctx.bold, GRAY);
  rightText(ctx, 'Hours', PAGE_W - MARGIN, y, size, ctx.bold, GRAY);
  ctx.y -= 13;
  rule(ctx, 4);
}

function rightText(ctx: Ctx, text: string, right: number, baseline: number, size: number, font: PDFFont, color = INK): void {
  draw(ctx, text, right - font.widthOfTextAtSize(text, size), baseline, size, font, color);
}

function workLog(ctx: Ctx, content: DailyContent): void {
  const rows = content.work.filter((r) => r.company.trim() !== '' || r.description.trim() !== '' || r.headcount !== null || r.hours !== null);
  if (rows.length === 0) return;
  heading(ctx, 'Work log');
  room(ctx, 30);
  tableHeader(ctx);
  const size = 9;
  const lh = 12;
  const again = () => {
    tableHeader(ctx);
  };
  for (const row of rows) {
    const company = wrapText(ctx.font, size, clean(ctx, row.company), COLS.company - 8);
    const desc = wrapText(ctx.font, size, clean(ctx, row.description), DESC_W - 8);
    const n = Math.max(company.length, desc.length, 1);
    for (let i = 0; i < n; i++) {
      room(ctx, lh, again);
      const y = ctx.y - size;
      draw(ctx, company[i] ?? '', MARGIN, y, size, ctx.font);
      draw(ctx, desc[i] ?? '', MARGIN + COLS.company, y, size, ctx.font);
      if (i === 0) {
        rightText(ctx, num(row.headcount), MARGIN + COLS.company + DESC_W + COLS.crew, y, size, ctx.font);
        rightText(ctx, num(row.hours), PAGE_W - MARGIN, y, size, ctx.font);
      }
      ctx.y -= lh;
    }
    ctx.y -= 2;
    rule(ctx, 4);
  }
  const crew = rows.reduce((sum, r) => sum + (r.headcount ?? 0), 0);
  const hours = rows.reduce((sum, r) => sum + (r.hours ?? 0), 0);
  room(ctx, lh, again);
  const y = ctx.y - size;
  draw(ctx, 'Total', MARGIN, y, size, ctx.bold);
  rightText(ctx, num(crew), MARGIN + COLS.company + DESC_W + COLS.crew, y, size, ctx.bold);
  rightText(ctx, num(hours), PAGE_W - MARGIN, y, size, ctx.bold);
  ctx.y -= lh + 6;
}

function notes(ctx: Ctx, content: DailyContent): void {
  for (const s of NOTE_SECTIONS) {
    const text = content.notes[s.key].trim();
    if (text === '') continue;
    heading(ctx, s.label);
    paragraph(ctx, text, 10, ctx.font);
    ctx.y -= 6;
  }
  const irs = content.inspections.filter((e) => e.text.trim() !== '');
  if (irs.length > 0) {
    heading(ctx, 'Inspections');
    for (const e of irs) {
      paragraph(ctx, e.text.trim(), 10, ctx.font);
      ctx.y -= 4;
    }
  }
}

async function embed(doc: PDFDocument, p: DailyPdfPhoto, index: number): Promise<PDFImage> {
  try {
    if (p.mime === 'image/jpeg' || p.mime === 'image/jpg') return await doc.embedJpg(p.bytes);
    if (p.mime === 'image/png') return await doc.embedPng(p.bytes);
  } catch (e) {
    console.error(`daily pdf: photo ${index + 1} (${p.mime}) failed to embed`, e);
    throw new PhotoReadError(index);
  }
  throw new PhotoReadError(index);
}

interface Cell {
  x: number;
  top: number;
  w: number;
  h: number;
}

function cells(per: 1 | 2 | 4, bottom: number, top: number): Cell[] {
  const gap = 14;
  const h = top - bottom;
  if (per === 1) return [{ x: MARGIN, top, w: WIDTH, h }];
  const rowH = (h - gap) / 2;
  if (per === 2) return [{ x: MARGIN, top, w: WIDTH, h: rowH }, { x: MARGIN, top: top - rowH - gap, w: WIDTH, h: rowH }];
  const colW = (WIDTH - gap) / 2;
  return [0, 1].flatMap((r) => [0, 1].map((c) => ({ x: MARGIN + c * (colW + gap), top: top - r * (rowH + gap), w: colW, h: rowH })));
}

function photoCell(ctx: Ctx, image: PDFImage, p: DailyPdfPhoto, cell: Cell): void {
  const capSize = 8.5;
  const capLh = 11;
  const lines: { text: string; size: number; font: PDFFont; color: typeof INK }[] = [
    ...wrapText(ctx.font, capSize, clean(ctx, p.caption.trim()), cell.w).filter((l) => l !== '').map((text) => ({ text, size: capSize, font: ctx.font, color: INK })),
    ...(p.rowLabel ? wrapText(ctx.font, 7.5, clean(ctx, p.rowLabel), cell.w).map((text) => ({ text, size: 7.5, font: ctx.font, color: GRAY })) : []),
    ...wrapText(ctx.font, 7.5, clean(ctx, p.stamp), cell.w).map((text) => ({ text, size: 7.5, font: ctx.font, color: GRAY })),
  ];
  const textH = lines.length * capLh + 6;
  const box = { w: cell.w, h: Math.max(cell.h - textH, 40) };
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.page.drawImage(image, { x: cell.x + (cell.w - w) / 2, y: cell.top - h, width: w, height: h });
  let y = cell.top - h - 6;
  for (const l of lines) {
    draw(ctx, l.text, cell.x, y - l.size, l.size, l.font, l.color);
    y -= capLh;
  }
}

async function photoPages(ctx: Ctx, input: DailyPdfInput): Promise<void> {
  const per = input.photosPerPage;
  const images = await Promise.all(input.photos.map((p, i) => embed(ctx.doc, p, i)));
  const pageCount = Math.ceil(input.photos.length / per);
  for (let pg = 0; pg < pageCount; pg++) {
    addPage(ctx);
    draw(ctx, pg === 0 ? 'Photos' : 'Photos (continued)', MARGIN, ctx.y - 11, 11, ctx.bold);
    const top = ctx.y - 22;
    const bottom = pg === pageCount - 1 ? SIGN_SPACE : BOTTOM;
    const slots = cells(per, bottom, top);
    slots.forEach((cell, i) => {
      const idx = pg * per + i;
      const photo = input.photos[idx];
      const image = images[idx];
      if (photo && image) photoCell(ctx, image, photo, cell);
    });
    ctx.y = bottom;
  }
}

function footers(ctx: Ctx, input: DailyPdfInput): void {
  const h = input.header;
  const left = clean(ctx, `${h.project_name} · ${h.label} #${input.number} · ${input.dateLabel}`);
  const max = WIDTH - 70;
  const size = Math.max(4, Math.min(7.5, (7.5 * max) / Math.max(ctx.font.widthOfTextAtSize(left, 7.5), 1)));
  ctx.pages.forEach((page, i) => {
    ctx.page = page;
    const pageNo = `Page ${i + 1} of ${ctx.pages.length}`;
    page.drawText(left, { x: MARGIN, y: FOOTER_Y, size, font: ctx.font, color: GRAY });
    ctx.onText?.({ page: i, x: MARGIN, y: FOOTER_Y, size, text: left });
    const w = ctx.font.widthOfTextAtSize(pageNo, 7.5);
    page.drawText(pageNo, { x: PAGE_W - MARGIN - w, y: FOOTER_Y, size: 7.5, font: ctx.font, color: GRAY });
    ctx.onText?.({ page: i, x: PAGE_W - MARGIN - w, y: FOOTER_Y, size: 7.5, text: pageNo });
  });
}

/** Builds the daily report PDF. Throws PhotoReadError for a photo that isn't a readable JPEG or PNG. */
export async function buildDailyReportPdf(input: DailyPdfInput, onText?: (t: DrawnText) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const title = `${input.header.label} #${input.number} - ${input.header.project_name}`;
  doc.setTitle(title.replace(/[^\x20-\x7e]/g, '?'));
  const first = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, font, bold, charset: new Set(font.getCharacterSet()), pages: [first], page: first, y: TOP, onText };

  titleBlock(ctx, input);
  workLog(ctx, input.content);
  notes(ctx, input.content);
  if (input.photos.length > 0) await photoPages(ctx, input);
  // The last page keeps room for the signature stamp.
  if (ctx.y < SIGN_SPACE) addPage(ctx);
  footers(ctx, input);
  return doc.save();
}

/** A calendar day (yyyy-MM-dd) as people read it: "Mon, Sep 28, 2026". No zone shift: it is a day, not an instant. */
export function dayLabel(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a calendar day: ${day}`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${day}T12:00:00Z`));
}

/** An instant in the job's zone for stamps: "Sep 26, 2026 4:05 PM PDT". */
export function instantLabel(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`;
}
