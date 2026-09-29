// Hours, contract hours, billing and invoices (SPEC §15, migration 0043). Rows derive from the generated types; invoice
// lines (jsonb) and the timesheets function's answers are pinned with zod at the boundary. All of it is the signed-in
// person's own: RLS answers nobody else.
import { z } from 'zod';
import type { Tables } from './database.types';

/** One of my submitted reports on a job, with its hours (the Hours tool's days). */
export type HoursDayRow = Pick<
  Tables<'daily_reports'>,
  'id' | 'project_id' | 'report_date' | 'report_type' | 'number' | 'header' | 'hours' | 'version'
>;

export const HOURS_DAY_COLS = 'id, project_id, report_date, report_type, number, header, hours, version';

export type HoursBudgetRow = Pick<
  Tables<'job_hours_budgets'>,
  'id' | 'project_id' | 'contract_hours' | 'baseline_hours' | 'baseline_through' | 'version'
>;

export const BUDGET_COLS = 'id, project_id, contract_hours, baseline_hours, baseline_through, version';

export type BillingProfileRow = Pick<
  Tables<'billing_profiles'>,
  'business_name' | 'address' | 'bill_to' | 'terms' | 'rate' | 'next_invoice_number' | 'version'
>;

export const BILLING_COLS = 'business_name, address, bill_to, terms, rate, next_invoice_number, version';

export type JobRateRow = Pick<Tables<'billing_job_rates'>, 'project_id' | 'rate' | 'version'>;

export const JOB_RATE_COLS = 'project_id, rate, version';

export const invoiceLineSchema = z.object({
  project_id: z.string(),
  job: z.string(),
  dsa: z.string().catch(''),
  hours: z.coerce.number(),
  rate: z.coerce.number(),
  amount: z.coerce.number(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export type InvoiceRow = Omit<
  Pick<
    Tables<'invoices'>,
    'id' | 'number' | 'period' | 'status' | 'issued_on' | 'bill_to' | 'lines' | 'total_hours' | 'total_amount' | 'sent_at' | 'paid_at' | 'version'
  >,
  'lines' | 'status'
> & { lines: InvoiceLine[]; status: InvoiceStatus };

export const INVOICE_COLS = 'id, number, period, status, issued_on, bill_to, lines, total_hours, total_amount, sent_at, paid_at, version';

/** A job of mine with the Hours tool on, and its company (the timesheet is per company). */
export interface HoursJob {
  project_id: string;
  name: string;
  org_id: string;
  org_name: string;
}

/** What the timesheets function answers: the PDF (base64) and its filename. */
export const pdfAnswerSchema = z.object({ filename: z.string().min(1), pdf: z.string().min(1) });

/** What the Billing form saves (save_billing_profile). */
export interface BillingSave {
  businessName: string;
  address: string;
  billTo: string;
  terms: string;
  /** Dollars per hour; null = none yet. */
  rate: number | null;
  nextNumber: number;
  version: number | null;
}
