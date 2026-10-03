// The OSFM inspection map (Revs, migration 0056): ONE 11x17 landscape page with the plan sheet's page embedded as vectors
// (scaled to fit, 18 pt margin, its /Rotate honored), the inspected walls highlighted over it in up to three colors, the
// title in red bold at the top left on a white box with the legend (swatch + item name) under it, and, on an IR that
// passed and is signed, the deputy's signature and date in that same box under the legend through the ONE stamp
// (stamp.ts), so nothing on the sheet (its number, its title block) is covered.
// The page content is embedded, not its annotations: old markups on an uploaded sheet never show (OSFM: no previously
// inspected work on a map), and the sheet viewer leaves them off too. Pure: bytes in, bytes out. Tests: irMap_test.ts.
import {
  LineCapStyle, LineJoinStyle, PDFDocument, type PDFFont, type PDFPage, StandardFonts, degrees, popGraphicsState,
  pushGraphicsState, rgb, setLineJoin,
} from 'pdf-lib';
import { HIGHLIGHT_OPACITY, MARKUP_COLORS, type MarkupColor, type Stroke, clampStroke } from '../markup.ts';
import { pdfSafe, wrapText } from './inspectionReport.ts';
import { STAMP_TEXT_SIZE, type StampSpot, signedByLine, stampSignature } from './stamp.ts';

/** The sheet itself can't be used (locked, damaged, no such page): the person's file, said in plain words. */
export class SheetError extends Error {
  override readonly name = 'SheetError';
}

/** 11 x 17 in, landscape. */
export const MAP_SIZE = { width: 1224, height: 792 } as const;
const MARGIN = 18;

const RED = rgb(0.8, 0.07, 0.07);
const INK = rgb(0.07, 0.09, 0.15);
const RULE = rgb(0.75, 0.77, 0.8);
const WHITE = rgb(1, 1, 1);

export interface MapLegendItem {
  color: MarkupColor;
  name: string;
}

export interface IrMapInput {
  /** The sheet PDF's bytes. */
  sheet: Uint8Array;
  /** 1-based page of the sheet. */
  page: number;
  strokes: readonly Stroke[];
  title: string;
  legend: readonly MapLegendItem[];
  /** A passed, signed IR: the deputy's signature (PNG or none), name and signed time. */
  stamp: { signaturePng: Uint8Array | null; name: string; signedAtLabel: string } | null;
}

/** OSFM's title: one definition with the request form's preview (../markup.ts). */
export { mapTitle, type MapTitleInput } from '../markup.ts';

/** Where the sheet sits on the map: the box it fills (as viewed), and how its page is drawn to read upright. */
export interface SheetPlacement {
  box: { x: number; y: number; width: number; height: number };
  /** drawPage arguments: the page's own coordinates turned by `rotate` degrees around (x, y), then scaled. */
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/** The sheet page (its visible box `crop` and /Rotate) fitted inside the map with the margin, centered. */
export function placeSheet(crop: { width: number; height: number }, rotation: number): SheetPlacement {
  const turn = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const turned = turn === 90 || turn === 270;
  const viewW = turned ? crop.height : crop.width;
  const viewH = turned ? crop.width : crop.height;
  const scale = Math.min((MAP_SIZE.width - 2 * MARGIN) / viewW, (MAP_SIZE.height - 2 * MARGIN) / viewH);
  const box = { width: viewW * scale, height: viewH * scale, x: 0, y: 0 };
  box.x = (MAP_SIZE.width - box.width) / 2;
  box.y = (MAP_SIZE.height - box.height) / 2;
  // A viewer turns a /Rotate page clockwise; drawing it turned the other way (counter-clockwise is positive) undoes it.
  switch (turn) {
    case 90: return { box, x: box.x, y: box.y + box.height, rotate: -90, scale };
    case 180: return { box, x: box.x + box.width, y: box.y + box.height, rotate: 180, scale };
    case 270: return { box, x: box.x + box.width, y: box.y, rotate: 90, scale };
    default: return { box, x: box.x, y: box.y, rotate: 0, scale };
  }
}

/** A stroke as an SVG path in map coordinates (y down from the top of the map) and its width in points. */
export function strokeOnMap(stroke: Stroke, box: SheetPlacement['box']): { d: string; width: number } {
  const s = clampStroke(stroke);
  const top = MAP_SIZE.height - box.y - box.height;
  const d = s.p
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(box.x + x * box.width).toFixed(2)} ${(top + y * box.height).toFixed(2)}`)
    .join(' ');
  return { d, width: s.w * box.width };
}

function hexColor(hex: string) {
  const v = Number.parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

function drawStrokes(page: PDFPage, strokes: readonly Stroke[], box: SheetPlacement['box']): void {
  for (const s of strokes) {
    const { d, width } = strokeOnMap(s, box);
    page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
    page.drawSvgPath(d, {
      x: 0, y: MAP_SIZE.height, borderColor: hexColor(MARKUP_COLORS[s.c]), borderWidth: width,
      borderOpacity: HIGHLIGHT_OPACITY, borderLineCap: LineCapStyle.Round,
    });
    page.pushOperators(popGraphicsState());
  }
}

const TITLE_SIZE = 14;
const TITLE_LEAD = 17;
const LEGEND_SIZE = 11;
const LEGEND_LEAD = 13.5;
const PAD = 9;
const SWATCH = { width: 28, height: 12 } as const;
/** The title box never covers more than this much of the sheet's width. */
const BOX_MAX_TEXT = 520;
/** The signature's box on the signature row (stamp.ts fits the image in it, the "Signed by" line to its right). */
const SIGNATURE = { width: 96, height: 34 } as const;
/** stamp.ts puts the line this far right of the signature's box. */
const STAMP_GAP = 8;

/** The signature row's content: whether there is a signature image, and the width of the "Signed by" line. */
interface SignRow {
  image: boolean;
  textWidth: number;
}

/**
 * Title and legend at the top left, on a white box with a thin red edge, and on a passed, signed IR a signature row
 * under the legend: answers the spot for the stamp there. Long names wrap; nothing is cut.
 */
function drawTitleBox(page: PDFPage, font: PDFFont, title: string, legend: readonly MapLegendItem[], sign: SignRow | null): StampSpot | null {
  const titleLines = wrapText(title, font, TITLE_SIZE, BOX_MAX_TEXT);
  const nameMax = BOX_MAX_TEXT - SWATCH.width - 8;
  const rows = legend.map((it) => ({ it, lines: wrapText(it.name, font, LEGEND_SIZE, nameMax) }));
  const signWidth = sign === null ? 0 : (sign.image ? SIGNATURE.width + STAMP_GAP : 0) + sign.textWidth;
  const widest = Math.max(
    signWidth,
    ...titleLines.map((l) => font.widthOfTextAtSize(l, TITLE_SIZE)),
    ...rows.flatMap((r) => r.lines.map((l) => SWATCH.width + 8 + font.widthOfTextAtSize(l, LEGEND_SIZE))),
  );
  const left = MARGIN + 6;
  const top = MAP_SIZE.height - MARGIN - 6;

  // Lay out first (baselines top-down; capitals are about 0.72 of the size), then draw the box and the text on it.
  let cursor = top - PAD;
  const titleBase = titleLines.map(() => {
    const base = cursor - TITLE_SIZE * 0.74;
    cursor -= TITLE_LEAD;
    return base;
  });
  let bottom = (titleBase[titleBase.length - 1] ?? top) - TITLE_SIZE * 0.22;
  cursor = bottom - 7;
  const rowTop = rows.map((r) => {
    const t = cursor;
    const h = Math.max(SWATCH.height, r.lines.length * LEGEND_LEAD);
    bottom = t - h;
    cursor -= h + 5;
    return t;
  });
  // The signature row: a hairline under the legend, then the signature's box with the line beside it. Without an
  // image the box is empty, so the line starts at the text's left edge (stamp.ts writes it STAMP_GAP past the box).
  let spot: StampSpot | null = null;
  let rule: number | null = null;
  if (sign !== null) {
    rule = bottom - 6;
    const height = sign.image ? SIGNATURE.height : STAMP_TEXT_SIZE;
    bottom = rule - 6 - height;
    spot = sign.image
      ? { page: 0, x: left + PAD, y: bottom, ...SIGNATURE }
      : { page: 0, x: left + PAD - STAMP_GAP, y: bottom, width: 0, height: 0 };
  }
  page.drawRectangle({
    x: left, y: bottom - PAD, width: widest + 2 * PAD, height: top - bottom + PAD, color: WHITE, borderColor: RED, borderWidth: 0.75,
  });
  if (rule !== null) {
    page.drawLine({ start: { x: left + PAD, y: rule }, end: { x: left + PAD + widest, y: rule }, thickness: 0.5, color: RULE });
  }

  titleLines.forEach((line, i) => {
    page.drawText(line, { x: left + PAD, y: titleBase[i] ?? top, size: TITLE_SIZE, font, color: RED });
  });
  rows.forEach(({ it, lines }, i) => {
    const t = rowTop[i] ?? bottom;
    const hex = hexColor(MARKUP_COLORS[it.color]);
    page.drawRectangle({
      x: left + PAD, y: t - SWATCH.height, ...SWATCH, color: hex, opacity: HIGHLIGHT_OPACITY, borderColor: hex, borderWidth: 0.75,
    });
    lines.forEach((line, k) => {
      const y = t - 1.5 - LEGEND_SIZE * 0.74 - k * LEGEND_LEAD;
      page.drawText(line, { x: left + PAD + SWATCH.width + 8, y, size: LEGEND_SIZE, font, color: INK });
    });
  });
  return spot;
}

async function loadSheet(bytes: Uint8Array): Promise<PDFDocument> {
  return await PDFDocument.load(bytes, { updateMetadata: false }).catch((e: unknown) => {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new SheetError('This sheet is password-protected. Unlock it and upload it again.');
    throw new SheetError('The sheet could not be read as a PDF.');
  });
}

export async function buildIrMap(input: IrMapInput): Promise<Uint8Array> {
  const src = await loadSheet(input.sheet);
  const srcPage = src.getPages()[input.page - 1];
  if (!srcPage) throw new SheetError(`The sheet has no page ${String(input.page)}.`);
  const crop = srcPage.getCropBox();
  const place = placeSheet(crop, srcPage.getRotation().angle);

  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(input.title));
  const page = doc.addPage([MAP_SIZE.width, MAP_SIZE.height]);
  const sheet = await doc
    .embedPage(srcPage, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height })
    .catch(() => {
      throw new SheetError(`Page ${String(input.page)} of the sheet could not be read.`);
    });
  page.drawPage(sheet, { x: place.x, y: place.y, xScale: place.scale, yScale: place.scale, rotate: degrees(place.rotate) });
  drawStrokes(page, input.strokes, place.box);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const stamp = input.stamp;
  // The stamp writes its line in Helvetica: measured the same way, so the box holds it.
  const sign = stamp
    ? {
      image: stamp.signaturePng !== null,
      textWidth: (await doc.embedFont(StandardFonts.Helvetica)).widthOfTextAtSize(signedByLine(stamp), STAMP_TEXT_SIZE),
    }
    : null;
  const spot = drawTitleBox(page, bold, input.title, input.legend, sign);

  // Without object streams: much less work for a big sheet, and nothing is compressed twice.
  const bytes = await doc.save({ useObjectStreams: false });
  return stamp && spot ? await stampSignature(bytes, { ...stamp, at: spot }) : bytes;
}
