// The letterhead at the top of the server-made PDFs (migration 0110): the job's brand logo at the left (fit in 150 x 48
// pt), the name as printed beside it in 12 pt bold (up to three lines) and the letterhead lines under the name in
// 8.5 pt gray. The ONE implementation: the IR, the dailies, the RFI and the inspection map all lay it out here. Laid out
// first (sizes known, the logo embedded), then drawn where the form wants it. Pure: data in, drawing out.
import { type PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from 'pdf-lib';
import { wrapText } from './inspectionReport.ts';

export interface Letterhead {
  /** The name as printed: the letterhead's, else the company's. */
  name: string;
  /** Address, phone, website: the ones set, in that order. */
  lines: readonly string[];
  /** The logo, PNG or JPEG; null for none. */
  logo: Uint8Array | null;
}

export interface LetterheadFonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** A letterhead laid out for a width: its size, and the one call that draws it with its top-left corner at (x, top). */
export interface PlacedLetterhead {
  width: number;
  height: number;
  draw: (page: PDFPage, x: number, top: number) => void;
}

export const LOGO_BOX = { width: 150, height: 48 } as const;
const GAP = 12;
const NAME_SIZE = 12;
const NAME_LEAD = 15;
const NAME_MAX_LINES = 3;
const LINE_SIZE = 8.5;
const LINE_LEAD = 11;
const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.42, 0.45, 0.5);

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function embedLogo(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  if (isPng(bytes)) return doc.embedPng(bytes);
  return Promise.reject(new Error('The company logo is not a JPEG or PNG.'));
}

/** Lays the letterhead out at most `maxWidth` wide (the logo, then the text in what is left). */
export async function layoutLetterhead(
  doc: PDFDocument,
  fonts: LetterheadFonts,
  lh: Letterhead,
  maxWidth: number,
): Promise<PlacedLetterhead> {
  let logo: { image: PDFImage; width: number; height: number } | null = null;
  if (lh.logo) {
    const image = await embedLogo(doc, lh.logo);
    const scale = Math.min(LOGO_BOX.width / image.width, LOGO_BOX.height / image.height);
    logo = { image, width: image.width * scale, height: image.height * scale };
  }
  const textX = logo ? logo.width + GAP : 0;
  const textW = Math.max(maxWidth - textX, 40);
  const names = wrapText(lh.name, fonts.bold, NAME_SIZE, textW).slice(0, NAME_MAX_LINES);
  const lines = lh.lines.flatMap((l) => wrapText(l, fonts.regular, LINE_SIZE, textW));
  const textH = names.length * NAME_LEAD + 4 + lines.length * LINE_LEAD;
  const widest = Math.max(
    0,
    ...names.map((n) => fonts.bold.widthOfTextAtSize(n, NAME_SIZE)),
    ...lines.map((l) => fonts.regular.widthOfTextAtSize(l, LINE_SIZE)),
  );
  return {
    width: Math.min(textX + widest, maxWidth),
    height: Math.max(logo?.height ?? 0, textH),
    draw: (page, x, top) => {
      if (logo) page.drawImage(logo.image, { x, y: top - logo.height, width: logo.width, height: logo.height });
      names.forEach((n, i) => {
        page.drawText(n, { x: x + textX, y: top - 14 - i * NAME_LEAD, size: NAME_SIZE, font: fonts.bold, color: INK });
      });
      const below = top - names.length * NAME_LEAD - 4;
      lines.forEach((l, i) => {
        page.drawText(l, { x: x + textX, y: below - 8 - i * LINE_LEAD, size: LINE_SIZE, font: fonts.regular, color: GRAY });
      });
    },
  };
}
