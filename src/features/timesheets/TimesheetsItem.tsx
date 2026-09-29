// The Timesheets tool's right column (full screen on the phone): my billing details, or one invoice.
import { BillingForm } from './BillingForm';
import { InvoiceItem } from './InvoiceItem';
import { BILLING_ITEM } from './model';

export function TimesheetsItem({ itemId }: { itemId: string }) {
  if (itemId === BILLING_ITEM) return <BillingForm />;
  return <InvoiceItem key={itemId} invoiceId={itemId} />;
}
