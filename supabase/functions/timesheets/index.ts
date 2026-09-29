// Timesheets and invoices (SPEC §15). Signed-in users only. Everything is read AS THE CALLER, and RLS lets a person
// read only their own hours, contract hours, billing and invoices. Nothing is stored: each PDF is rendered on request
// from saved data and handed back to the one person who asked (one click, with its filename), so there is no file for
// anyone else to reach. Each one is logged (audit).
//   timesheet: a month's timesheet for one company's jobs (the jobs with the Hours tool on): my submitted dailies'
//              hours, my contract table through the month's end, the company's logo and footer. A signed record
//              (SPEC §6.9): signingConfirmed else 403 reauth_required -> contentHash of what it prints ->
//              sign_timesheet() as the caller (fresh sign-in again, audit) -> render -> the ONE stamp.
//   invoice:   an invoice PDF from its saved snapshot (read as the caller: mine only) -> log_invoice_pdf (audit).
// Service client (admin_service_key_allowlist.txt): only the company logo's bytes, after the caller read the company.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, storageError } from '../_shared/db.ts';
import { requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { bytesToBase64, contentHash, sha256HexBytes } from '../_shared/crypto.ts';
import { buildFilename } from '../_shared/buildFilename.ts';
import { signedAtLabel } from '../_shared/inspections.ts';
import {
  computeBudgets, type HoursBudget, type HoursReport, monthGrid, monthSpan, priorWindow,
} from '../_shared/timesheet.ts';
import { buildTimesheet } from '../_shared/pdf/timesheet.ts';
import { buildInvoice, type InvoiceLine } from '../_shared/pdf/invoice.ts';
import { stampSignature } from '../_shared/pdf/stamp.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('timesheet'), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), org_id: uuid }).strict(),
  z.object({ action: z.literal('invoice'), invoice_id: uuid }).strict(),
]);

const TIMESHEET_NAME = '({MONTH}) TIMESHEET {YYYY}_{NAME}';
const INVOICE_NAME = '{Name} Invoice {#} {Month}';
const PAGE = 1000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

interface Job {
  id: string;
  name: string;
}

interface Me {
  name: string;
  timezone: string;
  signature: Uint8Array | null;
}

/** Every row of a query, a page at a time (PostgREST answers at most its max-rows per request). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = must(await page(from, from + PAGE - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function monthName(month: string): string {
  const { year, monthNo } = monthSpan(month);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNo - 1, 1)));
}

function dayLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone }).format(new Date(iso));
}

/** My name and zone (own profile) and my saved signature (own folder in the private signatures bucket), or null. */
async function me(client: Db, userId: string, email: string | undefined): Promise<Me> {
  const p = must(
    await client.from('profiles').select('full_name, timezone, signature_path').eq('user_id', userId).maybeSingle(),
    'profile lookup',
  ) as { full_name: string; timezone: string; signature_path: string | null } | null;
  const name = p?.full_name || email || 'Inspector';
  const timezone = p?.timezone ?? 'UTC';
  if (!p?.signature_path) return { name, timezone, signature: null };
  const { data, error } = await client.storage.from('signatures').download(p.signature_path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'signature image');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new HttpError(400, 'Your signature image must be a PNG. Add it again in Settings.');
  return { name, timezone, signature: bytes };
}

/** The company's logo: its row read as the caller (a member of one of its jobs), the bytes from private storage. */
async function companyLogo(client: Db, orgId: string): Promise<Uint8Array | null> {
  const org = must(await client.from('orgs').select('logo_path').eq('id', orgId).maybeSingle(), 'company lookup') as
    { logo_path: string | null } | null;
  if (!org) throw new HttpError(404, 'Company not found');
  if (!org.logo_path) return null;
  const { data, error } = await serviceClient().storage.from('org-logos').download(org.logo_path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'company logo');
  return new Uint8Array(await data.arrayBuffer());
}

/** The company's footer as I typed it on a job's company form (settings.locked.footer), newest setup first. */
async function companyFooter(client: Db, userId: string, jobIds: readonly string[]): Promise<string> {
  const setups = must(
    await client.from('daily_setups').select('settings').eq('author_id', userId).in('project_id', jobIds).order('chosen_at', { ascending: false }),
    'setup lookup',
  ) as { settings: { locked?: Record<string, unknown> } | null }[];
  for (const s of setups) {
    const footer = s.settings?.locked?.['footer'];
    if (typeof footer === 'string' && footer.trim() !== '') return footer;
  }
  return '';
}

function myHours(client: Db, userId: string, jobIds: readonly string[], from: string, to: string): Promise<HoursReport[]> {
  return allRows(
    (a, b) =>
      client.from('daily_reports').select('project_id, report_date, hours').eq('author_id', userId).eq('status', 'submitted')
        .is('deleted_at', null).in('project_id', jobIds).gte('report_date', from).lte('report_date', to).not('hours', 'is', null)
        .order('id').range(a, b),
    'hours lookup',
  ) as Promise<HoursReport[]>;
}

async function timesheet(client: Db, userId: string, email: string | undefined, month: string, orgId: string) {
  const span = monthSpan(month);
  const jobs = must(
    await client.from('projects').select('id, name').eq('org_id', orgId).contains('modules', ['hours']).is('deleted_at', null).order('name'),
    'job lookup',
  ) as Job[];
  if (jobs.length === 0) throw new HttpError(404, 'No jobs with Hours for that company.');
  const ids = jobs.map((j) => j.id);
  const nameOf = new Map(jobs.map((j) => [j.id, j.name]));
  const budgetRows = must(
    await client.from('job_hours_budgets').select('project_id, contract_hours, baseline_hours, baseline_through').eq('user_id', userId)
      .in('project_id', ids),
    'budget lookup',
  ) as Omit<HoursBudget, 'name'>[];
  const budgets: HoursBudget[] = budgetRows
    .map((b) => ({ ...b, contract_hours: Number(b.contract_hours), baseline_hours: Number(b.baseline_hours), name: nameOf.get(b.project_id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const monthReports = await myHours(client, userId, ids, span.first, span.last);
  const window = priorWindow(budgets, span.first);
  const priorReports = budgets.length === 0 || window.empty
    ? []
    : await myHours(client, userId, budgets.map((b) => b.project_id), window.priorStart, window.priorEnd);
  const projects = monthGrid(jobs.map((j) => ({ project_id: j.id, name: j.name })), monthReports, month);
  const table = computeBudgets({ budgets, priorReports, monthReports });
  if (projects.length === 0 && table.length === 0) throw new HttpError(400, `No hours in ${monthName(month)}.`);

  const person = await me(client, userId, email);
  const client_ = projects.length === 1 ? (projects[0]?.name ?? '') : 'Multiple Projects';
  const printed = { month, org: orgId, inspector: person.name, client: client_, projects, budgets: table };
  const hash = await contentHash(printed);
  const signedAt = await rpc<string>(client, 'sign_timesheet', { p_period: span.first, p_org_id: orgId, p_content_hash: hash });
  const pdf = await buildTimesheet({
    inspector: person.name,
    client: client_,
    month,
    projects,
    budgets: table,
    logo: await companyLogo(client, orgId),
    footer: await companyFooter(client, userId, ids),
    signedOn: dayLabel(signedAt, person.timezone),
  });
  const bytes = await stampSignature(pdf.bytes, {
    signaturePng: person.signature,
    name: person.name,
    signedAtLabel: signedAtLabel(signedAt, person.timezone),
    at: pdf.signAt,
  });
  const filename = `${buildFilename(TIMESHEET_NAME, {
    date: span.first,
    fields: { MONTH: monthName(month).split(' ')[0]?.toUpperCase() ?? '', NAME: person.name.toUpperCase() },
  })}.pdf`;
  return { filename, bytes };
}

interface InvoiceRow {
  id: string;
  number: number;
  period: string;
  issued_on: string;
  from_name: string;
  from_address: string;
  bill_to: string;
  terms: string;
  lines: { job?: unknown; dsa?: unknown; hours?: unknown; rate?: unknown; amount?: unknown }[];
  total_hours: number;
  total_amount: number;
}

const lineSchema = z.object({
  job: z.string(),
  dsa: z.string().default(''),
  hours: z.coerce.number(),
  rate: z.coerce.number(),
  amount: z.coerce.number(),
});

async function invoice(client: Db, invoiceId: string) {
  const inv = must(
    await client.from('invoices')
      .select('id, number, period, issued_on, from_name, from_address, bill_to, terms, lines, total_hours, total_amount')
      .eq('id', invoiceId).maybeSingle(),
    'invoice lookup',
  ) as InvoiceRow | null;
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const month = monthName(inv.period.slice(0, 7));
  const lines: InvoiceLine[] = inv.lines.map((l) => lineSchema.parse(l));
  const bytes = await buildInvoice({
    fromName: inv.from_name,
    fromAddress: inv.from_address,
    billTo: inv.bill_to,
    terms: inv.terms,
    number: inv.number,
    issuedOn: dayLabel(`${inv.issued_on}T12:00:00Z`, 'UTC'),
    monthLabel: month,
    lines,
    totalHours: Number(inv.total_hours),
    totalAmount: Number(inv.total_amount),
  });
  await rpc<null>(client, 'log_invoice_pdf', { p_invoice_id: inv.id, p_sha256: await sha256HexBytes(bytes) });
  const filename = `${buildFilename(INVOICE_NAME, { number: inv.number, fields: { Name: inv.from_name, Month: month } })}.pdf`;
  return { filename, bytes };
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 2048);
  if (body.action === 'invoice') {
    const out = await invoice(client, body.invoice_id);
    return ok(req, { filename: out.filename, pdf: bytesToBase64(out.bytes) });
  }
  if (!(await signingConfirmed(client, user, req))) return refuse(req, 403, 'reauth_required', 'Confirm it is you to sign this timesheet');
  const out = await timesheet(client, user.id, user.email, body.month, body.org_id);
  return ok(req, { filename: out.filename, pdf: bytesToBase64(out.bytes) });
}));
