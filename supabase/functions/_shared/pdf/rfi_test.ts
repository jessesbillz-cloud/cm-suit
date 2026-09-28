// `deno test --config supabase/functions/deno.json supabase/functions/_shared/pdf` — the RFI builder on synthetic data.
import { PDFDocument } from 'pdf-lib';
import { buildRfiPdf, type RfiPdfInput } from './rfi.ts';
import { stampSignature } from './stamp.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

// A 1x1 PNG (synthetic).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

function sample(over: Partial<RfiPdfInput> = {}): RfiPdfInput {
  return {
    orgName: 'Sample Builders',
    logo: null,
    job: { name: 'Sample Job A', number: 'S-100', address: '100 Sample Way' },
    number: null,
    mark: 'DRAFT',
    title: 'Slab edge at grid B',
    question: 'Detail 3/S-201 conflicts with the embed plate. Which governs?',
    suggestion: '',
    refs: 'S-201',
    from: { name: 'Sam Sample', company: 'Sample Concrete Co' },
    to: 'Architect',
    sentLabel: null,
    issuedLabel: null,
    dueLabel: null,
    neededByLabel: 'Oct 5, 2026',
    costImpact: null,
    timeImpact: true,
    otherPhotos: [],
    photos: [],
    answer: null,
    impactDays: 7,
    claim: null,
    ...over,
  };
}

async function pages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

Deno.test('RFI: a short draft is one page', async () => {
  check((await pages(await buildRfiPdf(sample()))) === 1, 'one page');
});

Deno.test('RFI: issued and answered, with the logo, photos, a claim and both signatures', async () => {
  const bytes = await buildRfiPdf(sample({
    logo: PNG_1PX,
    number: 3,
    mark: null,
    suggestion: 'Use the embed.',
    sentLabel: 'Sep 28, 2026',
    issuedLabel: 'Sep 29, 2026',
    dueLabel: 'Oct 6, 2026',
    costImpact: true,
    photos: [PNG_1PX, PNG_1PX, PNG_1PX],
    otherPhotos: ['crack.heic'],
    answer: { text: 'The embed governs.', by: 'Ann Sample', dateLabel: 'Oct 1, 2026', files: ['SK-1.pdf'] },
    claim: { cost: true, time: false, dateLabel: 'Oct 2, 2026', note: 'Crew standby', gcNote: 'We disagree' },
  }));
  const n = await pages(bytes);
  check(n >= 1, 'builds');
  const left = await stampSignature(bytes, { signaturePng: PNG_1PX, name: 'Sam Sample', signedAtLabel: 'Sep 28, 2026', align: 'left' });
  const both = await stampSignature(left, { signaturePng: null, name: 'Pat Sample', signedAtLabel: 'Sep 29, 2026' });
  check((await pages(both)) === n, 'stamping keeps the page count');
});

Deno.test('RFI: a long question flows onto continuation pages, never cut off', async () => {
  const question = Array.from({ length: 160 }, (_, i) => `Line ${i + 1}: sample question text at grid ${i}`).join('\n');
  check((await pages(await buildRfiPdf(sample({ question })))) >= 3, 'three or more pages');
});

Deno.test('RFI: a photo or logo that is not JPEG or PNG is refused; odd text is replaced', async () => {
  const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const photoErr = await buildRfiPdf(sample({ photos: [bad] })).then(() => null, (e: unknown) => e);
  check(photoErr instanceof Error && photoErr.message.includes('JPEG or PNG'), 'photo refused');
  const logoErr = await buildRfiPdf(sample({ logo: bad })).then(() => null, (e: unknown) => e);
  check(logoErr instanceof Error && logoErr.message.includes('logo'), 'logo refused');
  const ok = await buildRfiPdf(sample({ title: 'Anchors 中 — “quoted”', orgName: 'Sample Co ✓' }));
  check((await pages(ok)) === 1, 'builds');
});
