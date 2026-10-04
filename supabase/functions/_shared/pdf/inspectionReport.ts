// The IR PDF (SPEC §8.2, §13.2): a clean generic inspection report form. Pure: data in, bytes out. Company/agency
// form templates come later (SPEC §8.3); this is the standard builder. The signature goes on afterwards through the
// one stamp (stamp.ts), so the bottom of every page is kept clear for it. Overflow flows onto continuation pages,
// never cut off.
import { degrees, PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';

export interface InspectionReportInput {
  job: { name: string; number: string | null; address: string | null };
  gc: string | null;
  /** Who inspected and signed: the inspector, or the fire marshal on an OFS IR. */
  inspector: string;
  /** The word in front of that name; "Inspector" unless given. */
  inspectorLabel?: string;
  number: number;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  typeLabel: string;
  company: string;
  requestedBy: string;
  items: string;
  resultLabel: string;
  approved: boolean;
  resultNote: string | null;
  /** JPEG or PNG bytes; anything else is refused. */
  photos: readonly Uint8Array[];
  /** Set when the request is postponed: a banner and a mark on every page. */
  postponed: { reason: string; note: string | null; until: string | null } | null;
}

const SIZE: [number, number] = [612, 792];
const MARGIN = 48;
/** Kept clear at the bottom of every page for the signature stamp and the page line. */
const BOTTOM = 112;
const WIDTH = SIZE[0] - 2 * MARGIN;
const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const GREEN = rgb(0.09, 0.4, 0.2);
const RED = rgb(0.6, 0.11, 0.11);
const AMBER = rgb(0.76, 0.35, 0.05);

// WinAnsi (the standard fonts' encoding): printable ASCII, Latin-1 and the extra punctuation it maps.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Text the standard fonts can draw: tabs become spaces, anything outside WinAnsi becomes '?'. */
export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    const c = ch.codePointAt(0) ?? 63;
    const ok = ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
    out += ok ? ch : '?';
  }
  return out;
}

/** Wraps text to a width: keeps line breaks, splits words longer than a line. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut -= 1;
        if (line !== '') {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line === '' ? w : `${line} ${w}`;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

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
      c.page.drawText(pdfSafe(label), { x, y: c.y - 8, size: 7.5, font: c.fonts.bold, color: GRAY });
      (rows[j] ?? []).forEach((line, k) => {
        c.page.drawText(line, { x, y: c.y - 22 - k * 13, size: 10, font: c.fonts.regular, color: INK });
      });
    });
    c.y -= height;
  }
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function embedPhoto(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  if (isPng(bytes)) return doc.embedPng(bytes);
  return Promise.reject(new Error('A photo is not a JPEG or PNG.'));
}

async function photos(c: Cursor, list: readonly Uint8Array[]): Promise<void> {
  if (list.length === 0) return;
  c.section('Photos');
  const cellW = (WIDTH - 16) / 2;
  const cellH = 200;
  for (let i = 0; i < list.length; i += 2) {
    c.need(cellH + 12);
    for (let j = 0; j < 2 && i + j < list.length; j += 1) {
      const img = await embedPhoto(c.doc, list[i + j] as Uint8Array);
      const scale = Math.min(cellW / img.width, cellH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      c.page.drawImage(img, { x: MARGIN + j * (cellW + 16) + (cellW - w) / 2, y: c.y - h, width: w, height: h });
    }
    c.y -= cellH + 12;
  }
}

function header(c: Cursor, input: InspectionReportInput): void {
  const { bold } = c.fonts;
  const ir = `IR ${input.number}`;
  c.page.drawText('INSPECTION REPORT', { x: MARGIN, y: c.y - 16, size: 16, font: bold, color: INK });
  c.page.drawText(ir, { x: MARGIN + WIDTH - bold.widthOfTextAtSize(ir, 16), y: c.y - 16, size: 16, font: bold, color: INK });
  c.y -= 26;
  c.text([input.job.name, input.job.number].filter(Boolean).join(' · '), { color: GRAY });
  c.gap(4);
  c.rule();
}

function postponedBanner(c: Cursor, p: NonNullable<InspectionReportInput['postponed']>): void {
  const line = ['POSTPONED', p.reason, p.until ? `Expected ${p.until}` : null].filter(Boolean).join(' · ');
  const lines = wrapText(line, c.fonts.bold, 11, WIDTH - 20);
  const noteLines = p.note ? wrapText(p.note, c.fonts.regular, 10, WIDTH - 20) : [];
  const h = 14 + lines.length * 15 + noteLines.length * 13;
  c.need(h + 8);
  c.page.drawRectangle({ x: MARGIN, y: c.y - h, width: WIDTH, height: h, borderColor: AMBER, borderWidth: 1.5 });
  lines.forEach((l, i) => {
    c.page.drawText(l, { x: MARGIN + 10, y: c.y - 20 - i * 15, size: 11, font: c.fonts.bold, color: AMBER });
  });
  noteLines.forEach((l, i) => {
    c.page.drawText(l, { x: MARGIN + 10, y: c.y - 20 - lines.length * 15 - i * 13, size: 10, font: c.fonts.regular, color: INK });
  });
  c.y -= h + 8;
}

function result(c: Cursor, input: InspectionReportInput): void {
  c.section('Result');
  const label = input.resultLabel.toUpperCase();
  const color = input.approved ? GREEN : RED;
  c.need(34);
  const w = c.fonts.bold.widthOfTextAtSize(label, 14) + 24;
  c.page.drawRectangle({ x: MARGIN, y: c.y - 28, width: w, height: 26, borderColor: color, borderWidth: 1.5 });
  c.page.drawText(label, { x: MARGIN + 12, y: c.y - 20, size: 14, font: c.fonts.bold, color });
  c.y -= 36;
  if (input.resultNote) c.text(input.resultNote);
}

/** Page line on every page; a POSTPONED mark across each page when postponed. */
function finishPages(doc: PDFDocument, fonts: Fonts, input: InspectionReportInput): void {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = `IR ${input.number} · Page ${i + 1} of ${pages.length}`;
    page.drawText(text, { x: MARGIN, y: 36, size: 8, font: fonts.regular, color: GRAY });
    if (input.postponed) {
      page.drawText('POSTPONED', {
        x: 150, y: 260, size: 72, font: fonts.bold, color: AMBER, opacity: 0.12, rotate: degrees(35),
      });
    }
  });
}

export async function buildInspectionReport(input: InspectionReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`IR ${input.number}`);
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const c = new Cursor(doc, fonts, pdfSafe(`IR ${input.number} · ${input.job.name} (continued)`));

  header(c, input);
  if (input.postponed) postponedBanner(c, input.postponed);
  fieldGrid(c, [
    ['Address', input.job.address ?? ''],
    ['General contractor', input.gc ?? ''],
    [input.inspectorLabel ?? 'Inspector', input.inspector],
    ['Date', input.dateLabel],
    ['Time', `${input.timeLabel} · ${input.durationLabel}`],
    ['Type', input.typeLabel],
    ['Company', input.company],
    ['Requested by', input.requestedBy],
  ]);
  c.section('Items inspected');
  c.text(input.items);
  result(c, input);
  await photos(c, input.photos);
  finishPages(doc, fonts, input);
  return doc.save();
}
