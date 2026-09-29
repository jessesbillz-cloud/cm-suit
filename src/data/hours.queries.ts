// Hours reads (SPEC §15, 0043). RLS answers only the signed-in person's own rows: my submitted dailies' hours, my
// contract hours, my billing and my invoices. Nobody else's, whatever their role.
import { skipToken, useQuery } from '@tanstack/react-query';
import { computeBudgets, monthGrid, monthSpan, priorWindow, type BudgetRow, type HoursReport, type MonthProject } from '../lib/timesheet';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import {
  BILLING_COLS,
  BUDGET_COLS,
  HOURS_DAY_COLS,
  INVOICE_COLS,
  JOB_RATE_COLS,
  invoiceLineSchema,
  type BillingProfileRow,
  type HoursBudgetRow,
  type HoursDayRow,
  type HoursJob,
  type InvoiceRow,
  type InvoiceStatus,
  type JobRateRow,
} from './hours.types';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockHours from './mock/hours';

/** PostgREST answers at most max_rows per request; a person's hours are read in pages of that. */
const PAGE = 1000;

async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = throwIfError(await page(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** My submitted reports on a job with their hours, newest day first (the Hours tool's days). */
export function useMyHours(projectId: string) {
  const user = useUser();
  return useQuery({
    queryKey: qk.hoursPart('days', projectId),
    queryFn: async (): Promise<HoursDayRow[]> => {
      if (isMock()) return mockHours.days(projectId);
      const rows = await allPages((from, to) =>
        supabase
          .from('daily_reports')
          .select(HOURS_DAY_COLS)
          .eq('project_id', projectId)
          .eq('author_id', user.id)
          .eq('status', 'submitted')
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      );
      return rows.sort((a, b) => b.report_date.localeCompare(a.report_date) || (b.number ?? 0) - (a.number ?? 0));
    },
  });
}

/** My contract hours on a job, or null before I set them. */
export function useHoursBudget(projectId: string) {
  const user = useUser();
  return useQuery({
    queryKey: qk.hoursPart('budget', projectId),
    queryFn: async (): Promise<HoursBudgetRow | null> =>
      isMock()
        ? mockHours.budget(projectId)
        : throwIfErrorMaybe(
            await supabase.from('job_hours_budgets').select(BUDGET_COLS).eq('project_id', projectId).eq('user_id', user.id).maybeSingle(),
          ),
  });
}

/** My jobs with the Hours tool on, each with its company (a timesheet is per company), by name. */
export function useHoursJobs() {
  return useQuery({
    queryKey: qk.hoursPart('jobs'),
    queryFn: async (): Promise<HoursJob[]> => {
      if (isMock()) return mockHours.jobs();
      const mine = throwIfError(await supabase.rpc('my_projects')).filter((p) => p.modules.includes('hours'));
      if (mine.length === 0) return [];
      const rows = throwIfError(await supabase.from('projects').select('id, org_id').in('id', mine.map((p) => p.project_id)));
      const orgOf = new Map(rows.map((r) => [r.id, r.org_id]));
      return mine
        .flatMap((p) => {
          const org = orgOf.get(p.project_id);
          return org === undefined ? [] : [{ project_id: p.project_id, name: p.name, org_id: org, org_name: p.org_name }];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export interface MonthHours {
  /** Jobs with hours in the month, by day. */
  grid: MonthProject[];
  /** My contract hours per job, used through the end of the month. */
  budgets: BudgetRow[];
  total: number;
}

async function fetchMonth(userId: string, jobs: readonly HoursJob[], month: string): Promise<MonthHours> {
  const ids = jobs.map((j) => j.project_id);
  const span = monthSpan(month);
  const read = async (projectIds: readonly string[], from: string, to: string): Promise<HoursReport[]> =>
    isMock()
      ? mockHours.hoursBetween(projectIds, from, to)
      : allPages((a, b) =>
          supabase
            .from('daily_reports')
            .select('project_id, report_date, hours')
            .eq('author_id', userId)
            .eq('status', 'submitted')
            .is('deleted_at', null)
            .in('project_id', projectIds)
            .gte('report_date', from)
            .lte('report_date', to)
            .not('hours', 'is', null)
            .order('id')
            .range(a, b),
        );
  const budgetRows = isMock()
    ? await mockHours.budgets(ids)
    : throwIfError(await supabase.from('job_hours_budgets').select(BUDGET_COLS).eq('user_id', userId).in('project_id', ids));
  const nameOf = new Map(jobs.map((j) => [j.project_id, j.name]));
  const budgets = budgetRows
    .map((b) => ({ ...b, name: nameOf.get(b.project_id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const monthReports = await read(ids, span.first, span.last);
  const w = priorWindow(budgets, span.first);
  const priorReports = budgets.length === 0 || w.empty ? [] : await read(budgets.map((b) => b.project_id), w.priorStart, w.priorEnd);
  const grid = monthGrid(
    jobs.map((j) => ({ project_id: j.project_id, name: j.name })),
    monthReports,
    month,
  );
  return { grid, budgets: computeBudgets({ budgets, priorReports, monthReports }), total: grid.reduce((s, p) => s + p.total, 0) };
}

/** A month of my hours on these jobs (one company's) and my contract table through that month. */
export function useMonthHours(jobs: readonly HoursJob[] | undefined, month: string) {
  const user = useUser();
  const ids = (jobs ?? []).map((j) => j.project_id).join(',');
  return useQuery({
    queryKey: qk.hoursPart('month', `${month}:${ids}`),
    queryFn: jobs !== undefined ? () => fetchMonth(user.id, jobs, month) : skipToken,
  });
}

/** My billing details, or null before I set them. */
export function useBillingProfile() {
  const user = useUser();
  return useQuery({
    queryKey: qk.hoursPart('billing'),
    queryFn: async (): Promise<BillingProfileRow | null> =>
      isMock()
        ? mockHours.billing()
        : throwIfErrorMaybe(await supabase.from('billing_profiles').select(BILLING_COLS).eq('user_id', user.id).maybeSingle()),
  });
}

/** My own rate per job, where I set one. */
export function useJobRates() {
  const user = useUser();
  return useQuery({
    queryKey: qk.hoursPart('rates'),
    queryFn: async (): Promise<JobRateRow[]> =>
      isMock() ? mockHours.rates() : throwIfError(await supabase.from('billing_job_rates').select(JOB_RATE_COLS).eq('user_id', user.id)),
  });
}

function toInvoice(raw: Omit<InvoiceRow, 'lines' | 'status'> & { lines: unknown; status: string }): InvoiceRow {
  const status: InvoiceStatus = raw.status === 'sent' || raw.status === 'paid' ? raw.status : 'draft';
  return { ...raw, status, lines: invoiceLineSchema.array().parse(raw.lines) };
}

/** My invoices, newest month first. */
export function useInvoices() {
  const user = useUser();
  return useQuery({
    queryKey: qk.hoursPart('invoices'),
    queryFn: async (): Promise<InvoiceRow[]> => {
      if (isMock()) return mockHours.invoices();
      const rows = throwIfError(
        await supabase.from('invoices').select(INVOICE_COLS).eq('user_id', user.id).order('period', { ascending: false }),
      );
      return rows.map(toInvoice);
    },
  });
}
