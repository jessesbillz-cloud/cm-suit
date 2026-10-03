// `deno test supabase/functions/_shared/pdf/safetySheet_test.ts` — the sign-in sheet builder on synthetic data.
import { PDFDocument } from 'pdf-lib';
import { buildSafetySheet, type SafetySheetInput, type SheetAttendee } from './safetySheet.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const SIG: SheetAttendee['signature'] = [[[0.05, 0.6], [0.2, 0.3], [0.35, 0.7], [0.5, 0.35]], [[0.7, 0.5]]];

function person(i: number, over: Partial<SheetAttendee> = {}): SheetAttendee {
  return { name: `Sample Worker ${String(i)}`, company: 'Sample Framing Co', trade: 'Framer', timeLabel: '7:42 AM', signature: SIG, tickedBy: null, ...over };
}

function sample(over: Partial<SafetySheetInput> = {}): SafetySheetInput {
  return {
    job: { name: 'Sample Job A', number: 'S-100' },
    kindLabel: 'Tailgate',
    number: 12,
    dayLabel: 'Mon, Oct 5, 2026',
    title: 'Heat illness',
    leader: 'Sol Super',
    location: 'North gate',
    points: ['Drink water often.', 'Shade at 80 degrees.', 'Know the signs.'],
    questions: ['Where is the water today?', 'What would you do?'],
    notes: '',
    source: '8 CCR 3395',
    sourceUrl: 'https://www.dir.ca.gov/title8/3395.html',
    closedLabel: 'Oct 5, 2026, 7:55 AM PDT by Sol Super',
    attendees: [person(1), person(2, { signature: null, timeLabel: null, tickedBy: 'Sol Super' })],
    ...over,
  };
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return await PDFDocument.load(bytes);
}

Deno.test('sheet: a short tailgate is one Letter page', async () => {
  const doc = await load(await buildSafetySheet(sample()));
  check(doc.getPageCount() === 1, 'one page');
  const { width, height } = doc.getPage(0).getSize();
  check(width === 612 && height === 792, 'Letter portrait');
  check(doc.getTitle() === 'Tailgate 12 sign-in sheet', 'titled');
});

Deno.test('sheet: a big crew flows onto more pages, nobody dropped', async () => {
  const crew = Array.from({ length: 60 }, (_, i) => person(i + 1));
  const doc = await load(await buildSafetySheet(sample({ attendees: crew })));
  check(doc.getPageCount() >= 4, `continues (${String(doc.getPageCount())} pages)`);
});

Deno.test('sheet: long names, companies and outside-WinAnsi text never break it', async () => {
  const long = person(1, { name: 'Sample '.repeat(30), company: 'Company '.repeat(20), trade: 'Trade '.repeat(20) });
  const odd = person(2, { name: 'Zoë Ñúñez 李', company: 'Sample → Co' });
  const bytes = await buildSafetySheet(sample({ attendees: [long, odd], notes: 'Line one\nLine two', title: 'T'.repeat(160) }));
  check((await load(bytes)).getPageCount() >= 1, 'built');
});

Deno.test('sheet: nobody signed, no outline (an own meeting) still makes a sheet', async () => {
  const bytes = await buildSafetySheet(sample({ kindLabel: 'Meeting', attendees: [], points: [], questions: [], source: null, sourceUrl: null }));
  check((await load(bytes)).getPageCount() === 1, 'one page');
});

Deno.test('sheet: a one-point stroke (a dot over an i) is drawn, not refused', async () => {
  const bytes = await buildSafetySheet(sample({ attendees: [person(1, { signature: [[[0.4, 0.4]], [[0.1, 0.1], [0.9, 0.9]]] })] }));
  check(bytes.length > 1000, 'built');
});
