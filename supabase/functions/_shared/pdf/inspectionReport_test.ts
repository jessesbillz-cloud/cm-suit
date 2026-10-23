// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the IR builder on synthetic data.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildInspectionReport, type InspectionReportInput, pdfSafe, plainSpaces, wrapText } from './inspectionReport.ts';
import { stampSignature } from './stamp.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

// A 1x1 PNG (synthetic).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

function sample(over: Partial<InspectionReportInput> = {}): InspectionReportInput {
  return {
    job: { name: 'Sample Job A', number: 'S-100', address: '100 Sample Way' },
    gc: 'Sample Builders',
    inspector: 'Pat Sample',
    number: 12,
    dateLabel: 'Thu, Oct 1, 2026',
    timeLabel: '9:00 AM',
    durationLabel: '1 hr',
    typeLabel: 'IOR',
    company: 'Sample Concrete Co',
    requestedBy: 'Sam Sample',
    items: 'Footing rebar at grid A',
    resultLabel: 'Approved',
    approved: true,
    resultNote: 'No issues',
    photos: [],
    postponed: null,
    ...over,
  };
}

async function pages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

Deno.test('IR: a short report is one page and takes the signature stamp', async () => {
  const bytes = await buildInspectionReport(sample());
  check((await pages(bytes)) === 1, 'one page');
  const stamped = await stampSignature(bytes, { signaturePng: PNG_1PX, name: 'Pat Sample', signedAtLabel: 'Oct 1, 2026, 4:05 PM PDT' });
  check((await pages(stamped)) === 1, 'still one page after stamping');
});

Deno.test('IR: long items flow onto continuation pages, never cut off', async () => {
  const items = Array.from({ length: 160 }, (_, i) => `Line ${i + 1}: sample rebar check at grid ${i}`).join('\n');
  check((await pages(await buildInspectionReport(sample({ items })))) >= 3, 'three or more pages');
});

Deno.test('IR: postponed, not approved, with photos', async () => {
  const bytes = await buildInspectionReport(sample({
    approved: false,
    resultLabel: 'Not approved',
    postponed: { reason: 'Weather', note: 'Rain', until: 'Oct 5' },
    photos: [PNG_1PX, PNG_1PX, PNG_1PX],
  }));
  check((await pages(bytes)) >= 1, 'builds');
});

Deno.test('IR: a photo that is not JPEG or PNG is refused', async () => {
  const err = await buildInspectionReport(sample({ photos: [new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])] }))
    .then(() => null, (e: unknown) => e);
  check(err instanceof Error && err.message.includes('JPEG or PNG'), 'refused');
});

Deno.test('IR: text the standard fonts cannot draw is replaced, not thrown', async () => {
  check(pdfSafe('Grid A\tok 中文') === 'Grid A ok ??', 'tab to space, CJK to ?');
  const [nnbsp, thin] = [String.fromCharCode(0x202f), String.fromCharCode(0x2009)];
  check(pdfSafe(`4:05${nnbsp}PM${thin}PDT`) === '4:05 PM PDT', 'the hosted runtime\'s narrow space before PM is a plain space');
  const bytes = await buildInspectionReport(sample({ items: 'Anchors 中 — “quoted”', company: 'Sample Co ✓' }));
  check((await pages(bytes)) === 1, 'builds');
});

Deno.test('IR: plainSpaces turns every Unicode space into a plain one and leaves the rest', () => {
  const spaces = [0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000];
  for (const cp of spaces) {
    check(plainSpaces(`a${String.fromCharCode(cp)}b`) === 'a b', `U+${cp.toString(16).toUpperCase()} becomes a space`);
  }
  const kept = [0x00a0, 0x200b, 0x1fff, 0x200c, 0x2028, 0x3001].map((cp) => String.fromCharCode(cp)).join('');
  check(plainSpaces(`x${kept}\t\ny`) === `x${kept}\t\ny`, 'other characters, tabs and newlines stay');
  check(plainSpaces('Grid A 中') === 'Grid A 中', 'plain text is unchanged');
});

Deno.test('IR: wrapText keeps breaks and splits long words', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = wrapText(`one two\nthree ${'x'.repeat(200)}`, font, 10, 100);
  check(lines[0] === 'one two', 'first paragraph');
  check(lines[1] === 'three', 'long word goes to its own lines');
  check(lines.length > 3, 'long word split');
  check(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 100), 'every line fits');
});
