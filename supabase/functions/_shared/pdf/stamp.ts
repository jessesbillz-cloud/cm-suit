// The ONE signature stamp (SPEC §8.2, CLAUDE.md rule 11): signature image (when the person has one) + "Signed by
// {name} · {date time}". Pure: bytes in, bytes out. Official PDFs are rendered by edge functions (docs/decisions.md).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface StampInput {
  /** PNG bytes of the person's signature, or null to stamp the line alone. */
  signaturePng: Uint8Array | null;
  name: string;
  /** Already formatted in the project time zone, e.g. "Sep 26, 2026 4:05 PM PDT". */
  signedAtLabel: string;
  /** Which bottom corner. A record with two signatures (an RFI) puts the first on the left. Default right. */
  align?: 'left' | 'right';
}

const MARGIN = 36;
const SIG_WIDTH = 150;
const SIG_MAX_HEIGHT = 54;
const TEXT_SIZE = 8;

/** Stamps the last page, bottom right (or left). Returns new PDF bytes; the input is not modified. */
export async function stampSignature(pdfBytes: Uint8Array, input: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  if (!page) throw new Error('The PDF has no pages to stamp.');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { width: pageWidth } = page.getSize();

  const left = input.align === 'left';
  if (input.signaturePng) {
    const png = await doc.embedPng(input.signaturePng);
    const scale = Math.min(SIG_WIDTH / png.width, SIG_MAX_HEIGHT / png.height);
    const sigW = png.width * scale;
    const sigH = png.height * scale;
    page.drawImage(png, { x: left ? MARGIN : pageWidth - MARGIN - sigW, y: MARGIN + TEXT_SIZE + 4, width: sigW, height: sigH });
  }
  const text = `Signed by ${input.name} · ${input.signedAtLabel}`;
  const textW = font.widthOfTextAtSize(text, TEXT_SIZE);
  page.drawText(text, { x: left ? MARGIN : pageWidth - MARGIN - textW, y: MARGIN, size: TEXT_SIZE, font, color: rgb(0.2, 0.2, 0.2) });
  return doc.save();
}
