// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the stamp on synthetic PDFs.
import { PDFDocument } from 'pdf-lib';
import { stampSignature } from './stamp.ts';

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
