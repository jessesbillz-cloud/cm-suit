// `deno test supabase/functions/_shared/pdf/timesheet_test.ts` — the monthly timesheet and invoice builders on
// synthetic data: one landscape page for a normal month, further pages for many jobs and a long contract table, long
// names that fit, the stamp on the last page's signature line; the invoice on one Letter page, the DSA column only
// when used, and more pages for many jobs.
import { PDFDocument } from 'pdf-lib';
import { computeBudgets, monthGrid } from '../timesheet.ts';
import { buildInvoice, type InvoiceLine, money } from './invoice.ts';
import { stampSignature } from './stamp.ts';
import { buildTimesheet, type TimesheetPdfInput } from './timesheet.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function b64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

function jobs(n: number, long = false): { project_id: string; name: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    project_id: `j${String(i)}`,
    name: long ? `Sample Job ${String(i)} ${'with a very long sample name '.repeat(6)}` : `Sample Job ${String(i)}`,
  }));
}

function input(n: number, budgets: number, long = false): TimesheetPdfInput {
  const js = jobs(n, long);
  const reports = js.flatMap((j) => [1, 2, 3, 30].map((d) => ({ project_id: j.project_id, report_date: `2026-09-${String(d).padStart(2, '0')}`, hours: 8 })));
  const bs = jobs(budgets, long).map((j) => ({ ...j, contract_hours: 100, baseline_hours: 10, baseline_through: '2026-08-31' }));
  return {
    inspector: 'Pat Sample',
    client: n === 1 ? 'Sample Job 0' : 'Multiple Projects',
    month: '2026-09',
    projects: monthGrid(js, reports, '2026-09'),
    budgets: computeBudgets({ budgets: bs, monthReports: reports }),
    logo: PNG,
    footer: '1 Sample Way, Sample City\nOffice 555-0100',
    signedOn: '9/30/2026',
  };
}

async function pages(bytes: Uint8Array): Promise<PDFDocument> {
  return await PDFDocument.load(bytes);
}

Deno.test('timesheet: a normal month is one landscape page, stamped on its signature line', async () => {
  const pdf = await buildTimesheet(input(2, 2));
  const doc = await pages(pdf.bytes);
  check(doc.getPageCount() === 1, `pages ${String(doc.getPageCount())}`);
  const size = doc.getPage(0).getSize();
  check(size.width === 792 && size.height === 612, 'landscape Letter');
  check(pdf.signAt.page === 0, 'signs page 1');
  const signed = await stampSignature(pdf.bytes, { signaturePng: PNG, name: 'Pat Sample', signedAtLabel: 'Sep 30, 2026 4:05 PM PDT', at: pdf.signAt });
  check((await pages(signed)).getPageCount() === 1, 'stamped in place');
});

Deno.test('timesheet: many jobs and a long contract table go on further pages; the stamp follows', async () => {
  const pdf = await buildTimesheet(input(15, 40, true));
  const doc = await pages(pdf.bytes);
  check(doc.getPageCount() >= 4, `pages ${String(doc.getPageCount())}`);
  check(pdf.signAt.page === doc.getPageCount() - 1, 'the signature is on the last page');
});

Deno.test('timesheet: an idle month still prints (an empty grid, the budgets)', async () => {
  const pdf = await buildTimesheet({ ...input(0, 1), logo: null, footer: '' });
  check((await pages(pdf.bytes)).getPageCount() === 1, 'one page');
});

const LINES: InvoiceLine[] = [
  { job: 'Sample Job A', dsa: '04-000001', hours: 14.5, rate: 90, amount: 1305 },
  { job: 'Sample Job B', dsa: '', hours: 4, rate: 75, amount: 300 },
];

function invoice(lines: InvoiceLine[]) {
  return {
    fromName: 'Sample Inspection Services',
    fromAddress: '1 Sample Way\nSample City',
    billTo: 'Sample Inspection Co\n2 Sample Road',
    terms: 'Net 30',
    number: 41,
    issuedOn: '9/30/2026',
    monthLabel: 'September 2026',
    lines,
    totalHours: lines.reduce((s, l) => s + l.hours, 0),
    totalAmount: lines.reduce((s, l) => s + l.amount, 0),
  };
}

Deno.test('invoice: one Letter page; money as printed', async () => {
  const doc = await pages(await buildInvoice(invoice(LINES)));
  check(doc.getPageCount() === 1, 'one page');
  check(doc.getPage(0).getSize().height === 792, 'portrait Letter');
  check(money(1605) === '$1,605.00', money(1605));
});

Deno.test('invoice: many jobs with long names continue on further pages', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ ...LINES[0]!, job: `Sample Job ${String(i)} ${'long name '.repeat(8)}` }));
  check((await pages(await buildInvoice(invoice(many)))).getPageCount() >= 2, 'more pages');
  check((await pages(await buildInvoice({ ...invoice(LINES.map((l) => ({ ...l, dsa: '' }))), terms: '' }))).getPageCount() === 1, 'no DSA, no terms');
});
