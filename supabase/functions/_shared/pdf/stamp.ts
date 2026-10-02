// The ONE signature stamp (SPEC §8.2, CLAUDE.md rule 11): signature image (when the person has one) + "Signed by
// {name} · {date time}". Pure: bytes in, bytes out. Official PDFs are rendered by edge functions (docs/decisions.md).
// Its approval variant (permits, migration 0053) puts the official's "APPROVED" box on every page of a plan set, with
// the record's short content-hash line.
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { pdfSafe } from './inspectionReport.ts';

/** A company form's own signature line: the image sits in the box on the line (x, y = the line), "Signed by" to its right. */
export interface StampSpot {
  /** 0-based page index. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StampInput {
  /** PNG bytes of the person's signature, or null to stamp the line alone. */
  signaturePng: Uint8Array | null;
  name: string;
  /** Already formatted in the project time zone, e.g. "Sep 26, 2026 4:05 PM PDT". */
  signedAtLabel: string;
  /** Which bottom corner. A record with two signatures (an RFI) puts the first on the left. Default right. */
  align?: 'left' | 'right';
  /** A fixed spot instead of a bottom corner of the last page (a company form's signature line). */
  at?: StampSpot;
}

const MARGIN = 36;
const SIG_WIDTH = 150;
const SIG_MAX_HEIGHT = 54;
const TEXT_SIZE = 8;

/** Stamps the last page, bottom right (or left), or the given spot. Returns new PDF bytes; the input is not modified. */
export async function stampSignature(pdfBytes: Uint8Array, input: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const page = input.at ? pages[input.at.page] : pages[pages.length - 1];
  if (!page) throw new Error(input.at ? `The PDF has no page ${input.at.page + 1} to stamp.` : 'The PDF has no pages to stamp.');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { width: pageWidth } = page.getSize();
  const text = `Signed by ${input.name} · ${input.signedAtLabel}`;
  const textW = font.widthOfTextAtSize(text, TEXT_SIZE);
  const color = rgb(0.2, 0.2, 0.2);

  if (input.at) {
    const { x, y, width, height } = input.at;
    if (input.signaturePng) {
      const png = await doc.embedPng(input.signaturePng);
      const scale = Math.min(width / png.width, height / png.height);
      page.drawImage(png, { x, y, width: png.width * scale, height: png.height * scale });
    }
    page.drawText(text, { x: x + width + 8, y: y + 1, size: TEXT_SIZE, font, color });
    return doc.save();
  }

  const left = input.align === 'left';
  if (input.signaturePng) {
    const png = await doc.embedPng(input.signaturePng);
    const scale = Math.min(SIG_WIDTH / png.width, SIG_MAX_HEIGHT / png.height);
    const sigW = png.width * scale;
    const sigH = png.height * scale;
    page.drawImage(png, { x: left ? MARGIN : pageWidth - MARGIN - sigW, y: MARGIN + TEXT_SIZE + 4, width: sigW, height: sigH });
  }
  page.drawText(text, { x: left ? MARGIN : pageWidth - MARGIN - textW, y: MARGIN, size: TEXT_SIZE, font, color });
  return doc.save();
}

// ---------------------------------------------------------------------------------------------------------------------
// The approval stamp: a compact box at the top right of every page, as the page is viewed (its /Rotate honored), never
// more than 2.5 x 1.5 in, smaller on small sheets: "APPROVED", the official's company, the permit, the official, the day,
// and the record's hash line.
// ---------------------------------------------------------------------------------------------------------------------

/** The record's short content-hash line, the same on every stamp that carries one. */
export function hashLine(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('A stamp needs the record\'s sha256 content hash.');
  return `Hash ${hash.slice(0, 16)}`;
}

/** A page as a viewer shows it: its visible box (CropBox) in PDF user space, and its /Rotate. */
export interface PageFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** The box at full size: 2.5 x 1.5 in. */
export const APPROVAL_MAX = { width: 180, height: 108 } as const;

/** Where the box goes. Every size is in the viewer's orientation; (x, y) is its lower-left corner in user space. */
export interface ApprovalPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees to turn what is drawn (the page's own rotation), so it reads upright. */
  rotate: number;
  /** 1 at full size. */
  scale: number;
  /** The box's lower-left corner as viewed (u right, v up from the viewed page's lower-left). */
  u: number;
  v: number;
}

function quarterTurns(rotation: number): 0 | 90 | 180 | 270 {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return r === 90 || r === 180 || r === 270 ? r : 0;
}

/** A point as viewed (u right, v up, from the viewed lower-left) in the page's user space. */
export function viewToPage(frame: PageFrame, u: number, v: number): { x: number; y: number } {
  const { x, y, width: w, height: h } = frame;
  switch (quarterTurns(frame.rotation)) {
    case 90: return { x: x + w - v, y: y + u };
    case 180: return { x: x + w - u, y: y + h - v };
    case 270: return { x: x + v, y: y + h - u };
    default: return { x: x + u, y: y + v };
  }
}

/** The box for one page: a fifth of the viewed short side wide (at most 180 pt, at least 90 pt or nearly half the page),
 *  three fifths as tall, a tenth of its width in from the top and right edges. */
export function approvalPlacement(frame: PageFrame): ApprovalPlacement {
  const rotate = quarterTurns(frame.rotation);
  const turned = rotate === 90 || rotate === 270;
  const viewW = turned ? frame.height : frame.width;
  const viewH = turned ? frame.width : frame.height;
  const short = Math.min(viewW, viewH);
  const width = Math.min(APPROVAL_MAX.width, Math.max(short * 0.2, Math.min(90, short * 0.45)));
  const scale = width / APPROVAL_MAX.width;
  const height = APPROVAL_MAX.height * scale;
  const margin = width * 0.1;
  const u = viewW - margin - width;
  const v = viewH - margin - height;
  const at = viewToPage(frame, u, v);
  return { x: at.x, y: at.y, width, height, rotate, scale, u, v };
}

export interface ApprovalInput {
  /** The official's company; left out when empty. */
  company: string;
  /** "Permit 24-0001". */
  permitLabel: string;
  name: string;
  /** The day in the job's time zone, e.g. "Oct 1, 2026". */
  dateLabel: string;
  /** The record's sha256 content hash (hex). */
  hash: string;
}

const STAMP_GREEN = rgb(0.04, 0.4, 0.22);
const STAMP_INK = rgb(0.1, 0.12, 0.14);
const STAMP_GRAY = rgb(0.35, 0.37, 0.4);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

/** The text at the largest size from `size` down to `min` that fits; cut with "..." only when even `min` doesn't. */
function fit(font: PDFFont, raw: string, size: number, min: number, maxW: number): { text: string; size: number } {
  const text = pdfSafe(raw).replace(/\s+/g, ' ').trim();
  for (let s = size; s >= min; s -= 0.25) if (font.widthOfTextAtSize(text, s) <= maxW) return { text, size: s };
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, min) > maxW) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}...`, size: min };
}

function drawApproval(page: PDFPage, frame: PageFrame, fonts: Fonts, input: ApprovalInput): void {
  const p = approvalPlacement(frame);
  const s = p.scale;
  const rotate = degrees(p.rotate);
  const at = (du: number, dv: number) => viewToPage(frame, p.u + du, p.v + dv);
  page.drawRectangle({ ...at(0, 0), width: p.width, height: p.height, rotate, color: rgb(1, 1, 1), opacity: 0.92,
    borderColor: STAMP_GREEN, borderWidth: 1.4 * s });
  page.drawRectangle({ ...at(2.5 * s, 2.5 * s), width: p.width - 5 * s, height: p.height - 5 * s, rotate,
    borderColor: STAMP_GREEN, borderWidth: 0.5 * s });

  const pad = 9 * s;
  const inner = p.width - 2 * pad;
  const text = (t: { text: string; size: number }, font: PDFFont, dv: number, color = STAMP_INK) => {
    page.drawText(t.text, { ...at(pad, dv), size: t.size, font, color, rotate });
  };
  text(fit(fonts.bold, 'APPROVED', 16 * s, 12 * s, inner), fonts.bold, p.height - pad - 12 * s, STAMP_GREEN);
  const lines = [
    ...(input.company.trim() ? [{ raw: input.company, font: fonts.regular }] : []),
    { raw: input.permitLabel, font: fonts.bold },
    { raw: input.name, font: fonts.regular },
    { raw: input.dateLabel, font: fonts.regular },
  ];
  let dv = p.height - pad - 12 * s - 14 * s;
  for (const l of lines) {
    text(fit(l.font, l.raw, 9 * s, 6 * s, inner), l.font, dv);
    dv -= 12 * s;
  }
  // The record's hash under a hairline, at the foot of the box.
  page.drawLine({ start: at(pad, pad + 8.5 * s), end: at(p.width - pad, pad + 8.5 * s), thickness: 0.4 * s, color: STAMP_GREEN });
  text(fit(fonts.mono, hashLine(input.hash), 6 * s, 4.5 * s, inner), fonts.mono, pad, STAMP_GRAY);
}

/**
 * Stamps every page. Returns new PDF bytes and the page count; the input is not modified. A password-protected PDF is
 * refused (pdf-lib would write it out unreadable).
 */
export async function stampApproval(pdfBytes: Uint8Array, input: ApprovalInput): Promise<{ bytes: Uint8Array; pages: number }> {
  hashLine(input.hash);
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false }).catch((e: unknown) => {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new Error('This PDF is password-protected. Unlock it and try again.');
    throw e;
  });
  const pages = doc.getPages();
  if (pages.length === 0) throw new Error('The PDF has no pages to stamp.');
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  for (const page of pages) {
    const box = page.getCropBox();
    if (box.width <= 0 || box.height <= 0) continue;
    drawApproval(page, { ...box, rotation: page.getRotation().angle }, fonts, input);
  }
  // Without object streams: much less work for a big plan set, and nothing is compressed twice.
  return { bytes: await doc.save({ useObjectStreams: false }), pages: pages.length };
}
