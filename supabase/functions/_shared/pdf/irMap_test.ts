// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the inspection map on a synthetic
// sheet drawn with pdf-lib (a grid and two walls; no real job data).
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, degrees, rgb } from 'pdf-lib';
import { MAP_SIZE, buildIrMap, mapTitle, placeSheet, strokeOnMap } from './irMap.ts';
import { MARKUP_COLORS, type Stroke } from '../markup.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

// A 1x1 transparent PNG (synthetic).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** A 36 x 24 in sheet: a grid, two walls and a title block. */
async function sampleSheet(rotate = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([2592, 1728]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let x = 200; x <= 2000; x += 300) page.drawLine({ start: { x, y: 150 }, end: { x, y: 1600 }, thickness: 1, dashArray: [20, 8] });
  page.drawRectangle({ x: 500, y: 500, width: 900, height: 600, borderColor: rgb(0, 0, 0), borderWidth: 8 });
  page.drawText('SAMPLE SHEET A-201', { x: 2200, y: 100, size: 40, font });
  if (rotate) page.setRotation(degrees(rotate));
  return doc.save();
}

/** Every content stream of the map's page, decoded, as Latin-1 text. */
function pageContent(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => doc.context.lookup(ref))
    : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : ''))
    .join('\n');
}

/** Standard-font text is written as hex in the content stream. */
function hexOf(text: string): string {
  return Array.from(text, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Where a line of text starts on the page: the text matrix (… x y Tm) set last before it is shown. */
function textAt(content: string, text: string): { x: number; y: number } {
  const at = content.indexOf(`<${hexOf(text)}`);
  check(at >= 0, `text on the page: ${text}`);
  const moves = [...content.slice(0, at).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g)];
  const last = moves[moves.length - 1];
  check(last !== undefined, `a position for: ${text}`);
  return { x: Number(last?.[1]), y: Number(last?.[2]) };
}

/** Where images are drawn: each image's lower-left corner (the 1 0 0 1 x y cm before its Do). */
function imagesAt(content: string): { x: number; y: number }[] {
  return [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\s+(?:[^\n]*\n){0,3}?[^\n]*\/Image[^\s]* Do/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

const LEGEND = [
  { color: 1 as const, name: 'HOW Cavity Stuff' },
  { color: 2 as const, name: 'HOW Cavity Spray' },
  { color: 3 as const, name: 'HOW Beam Pockets' },
];
const STROKES: Stroke[] = [
  { c: 1, w: 0.004, p: [[0.2, 0.3], [0.5, 0.3], [0.5, 0.6]] },
  { c: 2, w: 0.004, p: [[0.25, 0.25], [0.25, 0.25]] },
];

Deno.test('irMap: the three colors are the contract (src/lib/markup.ts re-exports this same object)', () => {
  check(MARKUP_COLORS[1] === '#16A34A', 'green');
  check(MARKUP_COLORS[2] === '#2563EB', 'blue');
  check(MARKUP_COLORS[3] === '#DB2777', 'magenta');
});

Deno.test('irMap: OSFM title', () => {
  const t = mapTitle({ number: 377, ofsNumber: 65, phase: 'PH III', requestDate: '2026-10-05', what: 'Level 02 Cavity Stuffing' });
  check(t === 'IR 377 - OFS IR #0065 - PH III - 2026-10-05 - Level 02 Cavity Stuffing', `title: ${t}`);
  const bare = mapTitle({ number: 12, ofsNumber: null, phase: null, requestDate: '2026-10-05', what: 'Level 01 CJ' });
  check(bare === 'IR 12 - 2026-10-05 - Level 01 CJ', `no OFS number, no phase: ${bare}`);
});

Deno.test('irMap: one 11x17 landscape page with the title and the legend on it', async () => {
  const title = 'IR 377 - OFS IR #0065 - PH III - 2026-10-05 - Level 02 Cavity';
  const out = await PDFDocument.load(await buildIrMap({ sheet: await sampleSheet(), page: 1, strokes: STROKES, title, legend: LEGEND, stamp: null }));
  check(out.getPageCount() === 1, 'one page');
  const { width, height } = out.getPage(0).getSize();
  check(width === 1224 && height === 792, `11x17 landscape, got ${width} x ${height}`);
  const content = pageContent(out);
  check(content.includes(hexOf('IR 377 - OFS IR #0065')), 'the title is on the map');
  for (const it of LEGEND) check(content.includes(hexOf(it.name)), `legend: ${it.name}`);
  check(out.getTitle() === title, 'the document title');
});

Deno.test('irMap: strokes stay on the sheet and inside the width limits', () => {
  const box = placeSheet({ width: 2592, height: 1728 }, 0).box;
  const wild: Stroke = { c: 3, w: 0.4, p: [[-0.5, -0.2], [1.7, 0.5], [0.5, 9]] };
  const { d, width } = strokeOnMap(wild, box);
  const nums = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const top = MAP_SIZE.height - box.y - box.height;
  check(xs.every((x) => x >= box.x - 0.01 && x <= box.x + box.width + 0.01), `x inside the sheet: ${d}`);
  check(ys.every((y) => y >= top - 0.01 && y <= top + box.height + 0.01), `y inside the sheet: ${d}`);
  check(Math.abs(width - 0.05 * box.width) < 1e-6, `width clamped to 5% of the sheet: ${width}`);
});

Deno.test('irMap: the sheet fits inside the margin, turned upright when it has a /Rotate', async () => {
  const flat = placeSheet({ width: 2592, height: 1728 }, 0);
  check(flat.box.x >= 18 - 1e-9 && flat.box.y >= 18 - 1e-9, 'margin');
  check(flat.box.x + flat.box.width <= 1206 + 1e-9 && flat.box.y + flat.box.height <= 774 + 1e-9, 'inside the page');
  // A portrait page with /Rotate 90 is viewed landscape: its page height runs across the map.
  const turned = placeSheet({ width: 1728, height: 2592 }, 90);
  check(Math.abs(turned.box.width - flat.box.width) < 1e-6 && turned.rotate === -90, 'viewed landscape, drawn turned back');
  check(Math.abs(turned.y - (turned.box.y + turned.box.height)) < 1e-9, 'turned around the top-left corner');
  const out = await PDFDocument.load(await buildIrMap({ sheet: await sampleSheet(90), page: 1, strokes: STROKES, title: 'IR 1', legend: [], stamp: null }));
  check(out.getPageCount() === 1 && out.getPage(0).getRotation().angle === 0, 'the map itself is not rotated');
});

Deno.test('irMap: the signature and date sit in the title box under the legend, never over the sheet\'s corner', async () => {
  const signedAtLabel = 'Oct 5, 2026, 4:05 PM PDT';
  const base = { sheet: await sampleSheet(), page: 1, strokes: STROKES, title: 'IR 377 - OFS IR #0065 - PH III', legend: LEGEND };
  for (const signaturePng of [PNG_1PX, null]) {
    const doc = await PDFDocument.load(await buildIrMap({ ...base, stamp: { signaturePng, name: 'Pat Sample', signedAtLabel } }));
    const content = pageContent(doc);
    const line = textAt(content, `Signed by Pat Sample · ${signedAtLabel}`);
    const lastItem = textAt(content, LEGEND[2]?.name ?? '');
    const title = textAt(content, 'IR 377 - OFS IR #0065 - PH III');
    const what = signaturePng ? 'with a signature' : 'without one';
    // Top left, inside the title box's column, under the last legend line.
    check(line.y < lastItem.y && line.y > MAP_SIZE.height / 2, `${what}: under the legend, in the top half (y ${line.y})`);
    check(line.x < 300 && Math.abs(title.x - (signaturePng ? line.x - 104 : line.x)) < 1, `${what}: in the box's column (x ${line.x})`);
    // Nothing in the bottom right, where a sheet's number and title block are.
    check(!(line.x > MAP_SIZE.width / 2 && line.y < MAP_SIZE.height / 2), `${what}: not at the bottom right`);
    const images = imagesAt(content);
    if (signaturePng) {
      check(images.length === 1, `one signature image, got ${images.length}`);
      const img = images[0] ?? { x: -1, y: -1 };
      check(Math.abs(img.x - title.x) < 1 && Math.abs(img.y - (line.y - 1)) < 1, `the signature on the row, left of the line (${img.x}, ${img.y})`);
    } else {
      check(images.length === 0, 'no image without a signature');
    }
  }
});

Deno.test('irMap: a passed IR carries the stamp; a missing page or a non-PDF is refused in words', async () => {
  const base = { sheet: await sampleSheet(), page: 1, strokes: STROKES, title: 'IR 2', legend: LEGEND.slice(0, 1) };
  const plain = await buildIrMap({ ...base, stamp: null });
  const stamped = await buildIrMap({ ...base, stamp: { signaturePng: PNG_1PX, name: 'Pat Sample', signedAtLabel: 'Oct 5, 2026, 4:05 PM PDT' } });
  const doc = await PDFDocument.load(stamped);
  check(doc.getPageCount() === 1, 'still one page');
  check(pageContent(doc).includes(hexOf('Signed by Pat Sample')), 'the signature line');
  check(!pageContent(await PDFDocument.load(plain)).includes(hexOf('Signed by')), 'no stamp before it passed');

  const missing = await buildIrMap({ ...base, page: 2, stamp: null }).then(() => null, (e: unknown) => e);
  check(missing instanceof Error && missing.message === 'The sheet has no page 2.', 'missing page');
  const junk = await buildIrMap({ ...base, sheet: new TextEncoder().encode('not a pdf'), stamp: null }).then(() => null, (e: unknown) => e);
  check(junk instanceof Error && junk.message === 'The sheet could not be read as a PDF.', 'not a PDF');
});
