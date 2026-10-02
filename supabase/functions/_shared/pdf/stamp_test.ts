// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the stamp on synthetic PDFs.
import { PDFDocument, degrees } from 'pdf-lib';
import { APPROVAL_MAX, approvalPlacement, hashLine, stampApproval, stampSignature, viewToPage } from './stamp.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

// A 1x1 transparent PNG (synthetic).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

async function twoPages(): Promise<Uint8Array> {
  const src = await PDFDocument.create();
  src.addPage([612, 792]);
  src.addPage([612, 792]);
  return src.save();
}

Deno.test('stamp: keeps the page count, with and without a signature image', async () => {
  for (const signaturePng of [PNG_1PX, null]) {
    const out = await stampSignature(await twoPages(), { signaturePng, name: 'Pat Sample', signedAtLabel: 'Sep 26, 2026 4:05 PM PDT' });
    check((await PDFDocument.load(out)).getPageCount() === 2, 'two pages after stamping');
    check(out.length > 0, 'bytes out');
  }
});

Deno.test('stamp: two signatures, one in each bottom corner', async () => {
  const first = await stampSignature(await twoPages(), { signaturePng: PNG_1PX, name: 'Pat Sample', signedAtLabel: 'Sep 26, 2026', align: 'left' });
  const both = await stampSignature(first, { signaturePng: null, name: 'Sam Sample', signedAtLabel: 'Sep 27, 2026' });
  check((await PDFDocument.load(both)).getPageCount() === 2, 'two pages after both stamps');
  check(both.length > first.length, 'the second stamp added content');
});

Deno.test('stamp: a fixed spot (a company form\'s signature line) stamps that page, not the last', async () => {
  const at = { page: 0, x: 44, y: 83, width: 172, height: 30 };
  const before = await PDFDocument.load(await twoPages());
  const out = await PDFDocument.load(await stampSignature(await twoPages(), { signaturePng: PNG_1PX, name: 'Pat Sample', signedAtLabel: 'Sep 26, 2026', at }));
  check(out.getPageCount() === 2, 'two pages after stamping');
  const size = (d: PDFDocument, i: number) => d.getPage(i).node.Contents()?.toString().length ?? 0;
  check(size(out, 0) > size(before, 0), 'page 1 got the stamp');
  check(size(out, 1) === size(before, 1), 'page 2 is untouched');
  const err = await stampSignature(await twoPages(), { signaturePng: null, name: 'X', signedAtLabel: 'Y', at: { ...at, page: 5 } })
    .then(() => null, (e: unknown) => e);
  check(err instanceof Error && err.message.includes('no page 6'), 'a missing page is refused');
});

Deno.test('stamp: refuses a PDF with no pages', async () => {
  const bytes = await (await PDFDocument.create()).save({ addDefaultPage: false });
  const err = await stampSignature(bytes, { signaturePng: PNG_1PX, name: 'X', signedAtLabel: 'Y' }).then(() => null, (e: unknown) => e);
  check(err instanceof Error && err.message.includes('no pages'), 'refused with "no pages"');
});

// ---------------------------------------------------------------------------------------------------------------------
// The approval stamp (permits): layout math, then every page stamped
// ---------------------------------------------------------------------------------------------------------------------
const IN = 72;
const HASH = 'ab12'.repeat(16);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

Deno.test('approval: full size on big sheets, never more than 2.5 x 1.5 in, a quarter inch in from the top right', () => {
  for (const [w, h] of [[36 * IN, 24 * IN], [24 * IN, 36 * IN], [42 * IN, 30 * IN], [30 * IN, 42 * IN]]) {
    const p = approvalPlacement({ x: 0, y: 0, width: w, height: h, rotation: 0 });
    check(near(p.width, APPROVAL_MAX.width) && near(p.height, APPROVAL_MAX.height), `${String(w)}x${String(h)}: 180 x 108 pt`);
    check(p.width <= 2.5 * IN && p.height <= 1.5 * IN, 'within 2.5 x 1.5 in');
    check(near(p.x, w - 18 - 180) && near(p.y, h - 18 - 108), 'top right, 0.25 in in from both edges');
  }
});

Deno.test('approval: smaller on small sheets, still on the page', () => {
  const letter = approvalPlacement({ x: 0, y: 0, width: 8.5 * IN, height: 11 * IN, rotation: 0 });
  check(near(letter.width, 8.5 * IN * 0.2) && near(letter.height, letter.width * 0.6), 'letter: a fifth of the short side');
  check(letter.x > 8.5 * IN / 2 && letter.y > 11 * IN / 2, 'letter: in the top right quarter');
  check(letter.x + letter.width < 8.5 * IN && letter.y + letter.height < 11 * IN, 'letter: inside the page');
  const tabloid = approvalPlacement({ x: 0, y: 0, width: 11 * IN, height: 17 * IN, rotation: 0 });
  check(tabloid.width < APPROVAL_MAX.width && tabloid.width > letter.width, '11x17: between letter and full size');
  const tiny = approvalPlacement({ x: 0, y: 0, width: 3 * IN, height: 5 * IN, rotation: 0 });
  check(near(tiny.width, 90) && tiny.x > 0 && tiny.y > 0, 'a tiny page: 90 pt, still readable, still on the page');
});

Deno.test('approval: an offset crop box moves the box with it', () => {
  const a = approvalPlacement({ x: 0, y: 0, width: 36 * IN, height: 24 * IN, rotation: 0 });
  const b = approvalPlacement({ x: 100, y: 50, width: 36 * IN, height: 24 * IN, rotation: 0 });
  check(near(b.x - a.x, 100) && near(b.y - a.y, 50), 'shifted by the crop box origin');
});

Deno.test('approval: a rotated page still gets the box at the top right as it is viewed, upright', () => {
  // Stored portrait 24 x 36, shown landscape 36 x 24 (/Rotate 90).
  const frame = { x: 0, y: 0, width: 24 * IN, height: 36 * IN, rotation: 90 };
  const p = approvalPlacement(frame);
  check(p.rotate === 90 && near(p.width, 180), 'turned with the page, full size');
  // The viewed top right corner (36 x 24 in, less the margin) is the stored page's top left.
  const corner = viewToPage(frame, p.u + p.width, p.v + p.height);
  check(near(corner.x, 18) && near(corner.y, 36 * IN - 18), 'its far corner sits 0.25 in from the stored top left');
  for (const r of [0, 90, 180, 270, -90, 450]) {
    const f = { x: 0, y: 0, width: 24 * IN, height: 36 * IN, rotation: r };
    const q = approvalPlacement(f);
    for (const [du, dv] of [[0, 0], [q.width, 0], [0, q.height], [q.width, q.height]]) {
      const pt = viewToPage(f, q.u + du, q.v + dv);
      check(pt.x >= 0 && pt.x <= f.width && pt.y >= 0 && pt.y <= f.height, `rotation ${String(r)}: every corner on the page`);
    }
  }
});

Deno.test('approval: the hash line is the short form of the record hash, and only a sha256 is accepted', () => {
  check(hashLine(HASH) === `Hash ${HASH.slice(0, 16)}`, 'Hash + 16 hex');
  let refused = false;
  try {
    hashLine('not-a-hash');
  } catch {
    refused = true;
  }
  check(refused, 'a bad hash is refused');
});

Deno.test('approval: every page is stamped, whatever its size or rotation; the count stays', async () => {
  const src = await PDFDocument.create();
  src.addPage([36 * IN, 24 * IN]);
  src.addPage([8.5 * IN, 11 * IN]);
  src.addPage([24 * IN, 36 * IN]).setRotation(degrees(90));
  const before = await PDFDocument.load(await src.save());
  const input = { company: 'Sample Fire Authority', permitLabel: 'Permit 24-0001', name: 'Sample Deputy', dateLabel: 'Oct 1, 2026', hash: HASH };
  const out = await stampApproval(await src.save(), input);
  const after = await PDFDocument.load(out.bytes);
  check(out.pages === 3 && after.getPageCount() === 3, 'three pages in, three out');
  const size = (d: PDFDocument, i: number) => d.getPage(i).node.Contents()?.toString().length ?? 0;
  for (const i of [0, 1, 2]) check(size(after, i) > size(before, i), `page ${String(i + 1)} got the stamp`);
  const long = await stampApproval(await src.save(), { ...input, company: 'Sample '.repeat(30) });
  check(long.pages === 3, 'a company name too long for the box still stamps (it shrinks, then is cut)');
  const empty = await (await PDFDocument.create()).save({ addDefaultPage: false });
  const err = await stampApproval(empty, input).then(() => null, (e: unknown) => e);
  check(err instanceof Error && err.message.includes('no pages'), 'a PDF with no pages is refused');
});
