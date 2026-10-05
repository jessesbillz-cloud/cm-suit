// Hours, contract hours, billing and invoices for the e2e mock (0043), with the database's rules: hours only on the
// author's submitted reports, one budget per job, a baseline needs its last day, invoice numbers from the person's
// counter (never reused), one invoice a month, only a draft is priced again. Hours come from the mock dailies (the
// mock user's submitted reports). State lives in sessionStorage, never module state. Synthetic data only.
import { todayInZone, detectZone } from '../../lib/dates';
import { roundHours, type HoursReport } from '../../lib/timesheet';
import type { DailyReportRow } from '../dailies.types';
import { DataError, conflictError } from '../errors';
import type {
  BillingProfileRow,
  BillingSave,
  HoursBudgetRow,
  HoursDayRow,
  HoursJob,
  InvoiceLine,
  InvoiceRow,
  InvoiceStatus,
  JobRateRow,
} from '../hours.types';
import * as dailies from './dailies';
import * as jobsMock from './jobs';
import { delay } from './store';

interface MockHours {
  budgets: HoursBudgetRow[];
  billing: BillingProfileRow | null;
  rates: JobRateRow[];
  invoices: InvoiceRow[];
  /** Deleted draft invoices (the server-side flag): hidden, never renumbered. */
  deletedInvoices?: string[];
  seq: number;
}

const KEY = 'e2e-mock-hours';
const EMPTY: MockHours = { budgets: [], billing: null, rates: [], invoices: [], seq: 0 };

function read(): MockHours {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { ...EMPTY } : { ...EMPTY, ...(JSON.parse(raw) as Partial<MockHours>) };
}

function write(update: (s: MockHours) => MockHours): MockHours {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function bad(message: string): DataError {
  return new DataError(message, '22023', null);
}

function newId(prefix: string): string {
  return `${prefix}-${String(write((m) => ({ ...m, seq: m.seq + 1 })).seq)}`;
}

function toDay(r: DailyReportRow): HoursDayRow {
  return {
    id: r.id,
    project_id: r.project_id,
    report_date: r.report_date,
    report_type: r.report_type,
    number: r.number,
    header: r.header,
    hours: r.hours,
    version: r.version,
  };
}

export async function days(projectId: string): Promise<HoursDayRow[]> {
  await delay();
  return dailies
    .mySubmitted()
    .filter((r) => r.project_id === projectId)
    .map(toDay)
    .sort((a, b) => b.report_date.localeCompare(a.report_date));
}

export async function hoursBetween(projectIds: readonly string[], from: string, to: string): Promise<HoursReport[]> {
  await delay();
  return dailies
    .mySubmitted()
    .filter((r) => projectIds.includes(r.project_id) && r.report_date >= from && r.report_date <= to && r.hours !== null)
    .map((r) => ({ project_id: r.project_id, report_date: r.report_date, hours: r.hours }));
}

export function setHours(reportId: string, version: number, hours: number): Promise<DailyReportRow> {
  if (hours < 0 || hours > 24 || roundHours(hours) !== hours) return Promise.reject(bad('Hours are 0 to 24, in tenths.'));
  return dailies.setHours(reportId, version, hours);
}

export async function jobs(): Promise<HoursJob[]> {
  const mine = (await jobsMock.projects()).filter((p) => p.modules.includes('hours'));
  const rows = await Promise.all(mine.map((p) => jobsMock.project(p.project_id)));
  return mine
    .map((p, i) => ({ project_id: p.project_id, name: p.name, org_id: rows[i]?.org_id ?? '', org_name: p.org_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function budget(projectId: string): Promise<HoursBudgetRow | null> {
  await delay();
  return read().budgets.find((b) => b.project_id === projectId) ?? null;
}

export async function budgets(projectIds: readonly string[]): Promise<HoursBudgetRow[]> {
  await delay();
  return read().budgets.filter((b) => projectIds.includes(b.project_id));
}

export async function saveBudget(
  projectId: string,
  contract: number,
  baseline: number,
  through: string | null,
  version: number | null,
): Promise<HoursBudgetRow> {
  await delay();
  if (baseline > 0 && through === null) throw bad('Add the day the baseline runs through.');
  const current = read().budgets.find((b) => b.project_id === projectId) ?? null;
  if ((current?.version ?? null) !== version) throw conflictError();
  const row: HoursBudgetRow = {
    id: current?.id ?? newId('mock-budget'),
    project_id: projectId,
    contract_hours: contract,
    baseline_hours: baseline,
    baseline_through: through,
    version: (current?.version ?? 0) + 1,
  };
  write((m) => ({ ...m, budgets: [...m.budgets.filter((b) => b.project_id !== projectId), row] }));
  return row;
}

export async function billing(): Promise<BillingProfileRow | null> {
  await delay();
  return read().billing;
}

export async function saveBilling(b: BillingSave): Promise<BillingProfileRow> {
  await delay();
  const m = read();
  if ((m.billing?.version ?? null) !== b.version) throw conflictError();
  const used = Math.max(0, ...m.invoices.map((i) => i.number));
  if (b.nextNumber <= used) throw bad(`The next invoice # must be more than ${String(used)}.`);
  const row: BillingProfileRow = {
    business_name: b.businessName.trim(),
    address: b.address.trim(),
    bill_to: b.billTo.trim(),
    terms: b.terms.trim(),
    rate: b.rate,
    next_invoice_number: b.nextNumber,
    version: (m.billing?.version ?? 0) + 1,
  };
  write((s) => ({ ...s, billing: row }));
  return row;
}

export async function rates(): Promise<JobRateRow[]> {
  await delay();
  return read().rates;
}

export async function setRate(projectId: string, rate: number | null, version: number | null): Promise<JobRateRow> {
  await delay();
  const current = read().rates.find((r) => r.project_id === projectId) ?? null;
  if ((current?.version ?? null) !== version) throw conflictError();
  const row: JobRateRow = { project_id: projectId, rate, version: (current?.version ?? 0) + 1 };
  write((m) => ({ ...m, rates: [...m.rates.filter((r) => r.project_id !== projectId), row] }));
  return row;
}

function gone(m: MockHours, id: string): boolean {
  return (m.deletedInvoices ?? []).includes(id);
}

export async function invoices(): Promise<InvoiceRow[]> {
  await delay();
  const m = read();
  return m.invoices.filter((i) => !gone(m, i.id)).sort((a, b) => b.period.localeCompare(a.period));
}

/** invoice_snapshot: the month's lines at my rates, or a plain refusal. */
async function snapshot(month: string): Promise<InvoiceLine[]> {
  const m = read();
  const names = new Map((await jobsMock.projects()).map((p) => [p.project_id, p.name]));
  const byJob = new Map<string, number>();
  for (const r of dailies.mySubmitted()) {
    if (!r.report_date.startsWith(month) || (r.hours ?? 0) <= 0) continue;
    byJob.set(r.project_id, (byJob.get(r.project_id) ?? 0) + (r.hours ?? 0));
  }
  if (byJob.size === 0) throw bad('No hours in that month.');
  const lines = [...byJob].map(([projectId, hours]): InvoiceLine => {
    const rate = m.rates.find((r) => r.project_id === projectId)?.rate ?? m.billing?.rate ?? null;
    if (rate === null) throw bad('Set your rate first.');
    const h = roundHours(hours);
    return { project_id: projectId, job: names.get(projectId) ?? '', dsa: '', hours: h, rate, amount: Math.round(h * rate * 100) / 100 };
  });
  return lines.sort((a, b) => a.job.localeCompare(b.job));
}

function totals(lines: readonly InvoiceLine[]): { total_hours: number; total_amount: number } {
  return {
    total_hours: roundHours(lines.reduce((s, l) => s + l.hours, 0)),
    total_amount: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
  };
}

function today(): string {
  return todayInZone(detectZone());
}

export async function createInvoice(month: string): Promise<string> {
  await delay();
  const m = read();
  if (!m.billing) throw bad('Set up billing first.');
  const existing = m.invoices.find((i) => i.period === `${month}-01`);
  if (existing && !gone(m, existing.id)) return existing.id;
  if (existing) {
    // A deleted draft comes back with its number, priced from today's hours.
    const again = await snapshot(month);
    write((s) => ({
      ...s,
      deletedInvoices: (s.deletedInvoices ?? []).filter((d) => d !== existing.id),
      invoices: s.invoices.map((i): InvoiceRow =>
        i.id === existing.id
          ? { ...i, lines: again, ...totals(again), status: 'draft', sent_at: null, paid_at: null, issued_on: today(), version: i.version + 1 }
          : i,
      ),
    }));
    return existing.id;
  }
  const lines = await snapshot(month);
  const row: InvoiceRow = {
    id: newId('mock-invoice'),
    number: m.billing.next_invoice_number,
    period: `${month}-01`,
    status: 'draft',
    issued_on: today(),
    bill_to: m.billing.bill_to,
    lines,
    ...totals(lines),
    sent_at: null,
    paid_at: null,
    version: 1,
  };
  write((s) => ({
    ...s,
    invoices: [...s.invoices, row],
    billing: s.billing ? { ...s.billing, next_invoice_number: s.billing.next_invoice_number + 1, version: s.billing.version + 1 } : null,
  }));
  return row.id;
}

function updateInvoice(id: string, version: number, patch: (r: InvoiceRow) => Partial<InvoiceRow>): InvoiceRow {
  const m = read();
  const r = m.invoices.find((i) => i.id === id && !gone(m, i.id));
  if (!r) throw new DataError('That item no longer exists.', 'P0002', null);
  if (r.version !== version) throw conflictError();
  const next = { ...r, ...patch(r), version: r.version + 1 };
  write((m) => ({ ...m, invoices: m.invoices.map((i) => (i.id === id ? next : i)) }));
  return next;
}

export async function refreshInvoice(id: string, version: number): Promise<InvoiceRow> {
  await delay();
  const r = read().invoices.find((i) => i.id === id);
  if (r && r.status !== 'draft') throw bad('Only a draft can be updated.');
  const lines = await snapshot((r?.period ?? '').slice(0, 7));
  return updateInvoice(id, version, () => ({ lines, ...totals(lines), issued_on: today(), bill_to: read().billing?.bill_to ?? '' }));
}

export async function setInvoiceStatus(id: string, version: number, status: InvoiceStatus): Promise<InvoiceRow> {
  await delay();
  const now = new Date().toISOString();
  return updateInvoice(id, version, (r) => ({
    status,
    sent_at: status === 'draft' ? null : (r.sent_at ?? now),
    paid_at: status === 'paid' ? (r.paid_at ?? now) : null,
  }));
}

/** delete_invoice: my draft, version-checked; a sent or paid one is refused. */
export async function deleteInvoice(id: string, version: number): Promise<void> {
  await delay();
  const m = read();
  const r = m.invoices.find((i) => i.id === id && !gone(m, i.id));
  if (!r) throw new DataError('That item no longer exists.', 'P0002', null);
  if (r.version !== version) throw conflictError();
  if (r.status !== 'draft') throw bad('Only a draft can be deleted.');
  write((s) => ({ ...s, deletedInvoices: [...(s.deletedInvoices ?? []), id] }));
}

/** restore_invoice (Undo): back as it was; safe to repeat. */
export async function restoreInvoice(id: string): Promise<InvoiceRow> {
  await delay();
  const r = read().invoices.find((i) => i.id === id);
  if (!r) throw new DataError('That item no longer exists.', 'P0002', null);
  write((s) => ({ ...s, deletedInvoices: (s.deletedInvoices ?? []).filter((d) => d !== id) }));
  return r;
}

/** What the timesheets function answers: a stand-in PDF and its filename. */
export async function pdf(body: object): Promise<{ filename: string; pdf: string }> {
  await delay(150);
  const b = body as { action?: string; month?: string; invoice_id?: string };
  if (b.action === 'invoice') {
    const inv = read().invoices.find((i) => i.id === b.invoice_id);
    if (!inv) throw new DataError('Invoice not found', 'P0002', null);
    return { filename: `Sample Invoice ${String(inv.number)}.pdf`, pdf: btoa(`%PDF-1.4\n% Synthetic e2e invoice ${String(inv.number)}\n`) };
  }
  return { filename: `(${b.month ?? ''}) TIMESHEET_SAMPLE USER.pdf`, pdf: btoa(`%PDF-1.4\n% Synthetic e2e timesheet ${b.month ?? ''}\n`) };
}
