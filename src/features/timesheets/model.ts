// The Timesheets tool's small rules: the billing item, an invoice's status chip and its title, the month shown.
import type { InvoiceRow, InvoiceStatus } from '../../data/hours.types';
import { detectZone, todayInZone } from '../../lib/dates';
import type { StatusKey } from '../../lib/status';

/** The right column's billing form (an invoice id opens that invoice). */
export const BILLING_ITEM = 'billing';

export const INVOICE_STATUSES: readonly { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
];

/** Draft gray, Sent blue, Paid green (lib/status colors). */
export function invoiceChip(status: InvoiceStatus): { status: StatusKey; label: string } {
  if (status === 'paid') return { status: 'approved', label: 'Paid' };
  if (status === 'sent') return { status: 'assigned', label: 'Sent' };
  return { status: 'cancelled', label: 'Draft' };
}

export function invoiceTitle(inv: Pick<InvoiceRow, 'number'>): string {
  return `Invoice #${String(inv.number)}`;
}

/** This month (yyyy-MM) where I am. */
export function currentMonth(): string {
  return todayInZone(detectZone()).slice(0, 7);
}

/** The month in the URL (?day=yyyy-MM-01), never after this month; else this month. */
export function monthFrom(day: string | undefined): string {
  const now = currentMonth();
  const m = day !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : now;
  return m > now ? now : m;
}
