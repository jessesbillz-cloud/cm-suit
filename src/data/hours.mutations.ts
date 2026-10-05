// Hours writes (SPEC §15, 0043). Every write is an RPC as the caller with a version check; the database owns invoice
// numbers and the one-invoice-a-month rule. The PDFs come from the timesheets edge function (rendered on the server,
// never in the browser) and go through lib/saveFile.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveFile } from '../lib/saveFile';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { pdfAnswerSchema, type BillingSave, type InvoiceStatus } from './hours.types';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockHours from './mock/hours';

function useRefreshHours() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.hours });
}

interface HoursSave {
  reportId: string;
  version: number;
  hours: number;
}

/** A submitted report's hours (the author only). The report's version moves, so the job's dailies are read again (after a
 *  conflict too, so the next tap carries the version the server has). */
export function useSetDailyHours(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, version, hours }: HoursSave) =>
      isMock()
        ? mockHours.setHours(reportId, version, hours)
        : throwIfError(await supabase.rpc('set_daily_hours', { p_report_id: reportId, p_version: version, p_hours: hours })),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: qk.hours }), qc.invalidateQueries({ queryKey: qk.dailies(projectId) })]),
  });
}

interface BudgetSave {
  contract: number;
  baseline: number;
  /** yyyy-MM-dd, or null with no baseline. */
  through: string | null;
  version: number | null;
}

export function useSaveHoursBudget(projectId: string) {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async ({ contract, baseline, through, version }: BudgetSave) => {
      if (isMock()) return mockHours.saveBudget(projectId, contract, baseline, through, version);
      // p_through null = no baseline day; the generated types call the argument required, PostgREST passes the null.
      const args = { p_project_id: projectId, p_contract: contract, p_baseline: baseline, p_through: through as string };
      return throwIfError(await supabase.rpc('save_hours_budget', version === null ? args : { ...args, p_version: version }));
    },
    onSuccess: refresh,
  });
}

export function useSaveBillingProfile() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async (b: BillingSave) => {
      if (isMock()) return mockHours.saveBilling(b);
      const args = {
        p_business_name: b.businessName,
        p_address: b.address,
        p_bill_to: b.billTo,
        p_terms: b.terms,
        // null = no usual rate yet; PostgREST passes the null through.
        p_rate: b.rate as number,
        p_next_invoice_number: b.nextNumber,
      };
      return throwIfError(await supabase.rpc('save_billing_profile', b.version === null ? args : { ...args, p_version: b.version }));
    },
    onSuccess: refresh,
  });
}

export function useSetJobRate() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async ({ projectId, rate, version }: { projectId: string; rate: number | null; version: number | null }) => {
      if (isMock()) return mockHours.setRate(projectId, rate, version);
      // null = my usual rate; PostgREST passes the null through.
      const args = { p_project_id: projectId, p_rate: rate as number };
      return throwIfError(await supabase.rpc('set_job_rate', version === null ? args : { ...args, p_version: version }));
    },
    onSuccess: refresh,
  });
}

/** The month's invoice: made once (numbered by the database), asked again it is the same invoice. Answers its id. */
export function useCreateInvoice() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async (month: string): Promise<string> =>
      isMock()
        ? mockHours.createInvoice(month)
        : throwIfError(await supabase.rpc('create_invoice', { p_period: `${month}-01` })).id,
    onSuccess: refresh,
  });
}

export function useRefreshInvoice() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) =>
      isMock()
        ? mockHours.refreshInvoice(id, version)
        : throwIfError(await supabase.rpc('refresh_invoice', { p_invoice_id: id, p_version: version })),
    onSuccess: refresh,
  });
}

export function useSetInvoiceStatus() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async ({ id, version, status }: { id: string; version: number; status: InvoiceStatus }) =>
      isMock()
        ? mockHours.setInvoiceStatus(id, version, status)
        : throwIfError(await supabase.rpc('set_invoice_status', { p_invoice_id: id, p_version: version, p_status: status })),
    onSuccess: refresh,
  });
}

/** A draft invoice deleted (Undo is restore). Its number is never reused: asking for the month again brings it back. */
export function useDeleteInvoice() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }): Promise<void> => {
      if (isMock()) return mockHours.deleteInvoice(id, version);
      throwIfErrorMaybe(await supabase.rpc('delete_invoice', { p_invoice_id: id, p_version: version }));
    },
    onSuccess: refresh,
  });
}

export function useRestoreInvoice() {
  const refresh = useRefreshHours();
  return useMutation({
    mutationFn: async (id: string) =>
      isMock() ? mockHours.restoreInvoice(id) : throwIfError(await supabase.rpc('restore_invoice', { p_invoice_id: id })),
    onSuccess: refresh,
  });
}

function pdfBlob(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

/** A PDF the timesheets function rendered: its filename and its bytes (base64). */
interface RenderedPdf {
  filename: string;
  pdf: string;
}

function renderPdf(body: object): Promise<RenderedPdf> {
  return isMock() ? mockHours.pdf(body) : callFunction('timesheets', body, pdfAnswerSchema);
}

/** Saves a rendered PDF (one click, its own filename). */
export async function saveRenderedPdf(out: RenderedPdf): Promise<void> {
  await saveFile(pdfBlob(out.pdf), out.filename);
}

/**
 * A rendered PDF for the file viewer (ui/FileViewer): a data: URL of the bytes already in hand, which pdf.js reads in
 * place. Nothing to revoke when the viewer closes (an object URL would be, and the viewer has no close hook for it).
 */
export function renderedPdfUrl(out: RenderedPdf): string {
  return `data:application/pdf;base64,${out.pdf}`;
}

/** Signs and downloads a month's timesheet for one company's jobs (SignButton handles the re-confirmation). Answers the
 *  signed PDF, so View can show it without signing again. */
export function useTimesheetPdf() {
  return useMutation({
    mutationFn: async ({ month, orgId }: { month: string; orgId: string }): Promise<RenderedPdf> => {
      const out = await renderPdf({ action: 'timesheet', month, org_id: orgId });
      await saveRenderedPdf(out);
      return out;
    },
  });
}

export function useInvoicePdf() {
  return useMutation({
    mutationFn: async (invoiceId: string): Promise<void> => {
      await saveRenderedPdf(await renderPdf({ action: 'invoice', invoice_id: invoiceId }));
    },
  });
}

/** The invoice's PDF to look at (the same rendering as its Download). */
export async function invoicePdfUrl(invoiceId: string): Promise<string> {
  return renderedPdfUrl(await renderPdf({ action: 'invoice', invoice_id: invoiceId }));
}
