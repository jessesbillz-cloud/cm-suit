// My invoices, newest month first: number, month, hours, amount and Draft / Sent / Paid. The month shown above gets
// its invoice in one click (made once, numbered by the database; asked again, the same one opens) once my billing
// details are in; Billing opens them in the right column.
import { FilePlus2, Landmark } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCreateInvoice } from '../../data/hours.mutations';
import { useBillingProfile, useInvoices } from '../../data/hours.queries';
import type { InvoiceRow } from '../../data/hours.types';
import { formatMoney } from '../../lib/format';
import { hoursText, monthLabel } from '../../lib/timesheet';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { HEAD_ROW, TABLE, TD, TD_NUM, TH, phoneRowClass, rowClass } from '../../ui/Table';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { BILLING_ITEM, invoiceChip } from './model';

interface ListProps {
  rows: readonly InvoiceRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  isPhone: boolean;
}

function InvoiceList({ rows, selectedId, onOpen, isPhone }: ListProps) {
  if (isPhone) {
    return (
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const chip = invoiceChip(r.status);
          return (
            <li key={r.id}>
              <button
                type="button"
                data-testid={`invoice-row-${String(r.number)}`}
                className={`${phoneRowClass(selectedId === r.id)} flex flex-col gap-1`}
                onClick={() => {
                  onOpen(r.id);
                }}
              >
                <span className="flex w-full items-start gap-3">
                  <span className="min-w-0 flex-1 text-[15px] leading-6 text-ink">
                    #{r.number} · {monthLabel(r.period.slice(0, 7))}
                  </span>
                  <StatusChip status={chip.status} label={chip.label} />
                </span>
                <span className="text-xs tabular-nums text-ink-2">
                  {hoursText(r.total_hours)} h · {formatMoney(r.total_amount)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <table className={TABLE}>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-20 pl-4`}>No.</th>
          <th className={TH}>Month</th>
          <th className={`${TH} w-24 text-right`}>Hours</th>
          <th className={`${TH} w-32 text-right`}>Amount</th>
          <th className={`${TH} w-28 pr-4`}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const chip = invoiceChip(r.status);
          return (
            <tr
              key={r.id}
              data-testid={`invoice-row-${String(r.number)}`}
              aria-current={selectedId === r.id ? 'true' : undefined}
              className={rowClass(selectedId === r.id)}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className={`${TD_NUM} pl-4 font-medium text-ink-2`}>#{r.number}</td>
              <td className={`${TD} text-ink`}>
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className="text-left font-medium">
                  {monthLabel(r.period.slice(0, 7))}
                </button>
              </td>
              <td className={`${TD_NUM} text-right text-ink-2`}>{hoursText(r.total_hours)}</td>
              <td className={`${TD_NUM} text-right font-medium text-ink`}>{formatMoney(r.total_amount)}</td>
              <td className={`${TD} pr-4`}>
                <StatusChip status={chip.status} label={chip.label} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface InvoicesCardProps {
  month: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  isPhone: boolean;
}

export function InvoicesCard({ month, selectedId, onOpen, isPhone }: InvoicesCardProps) {
  const invoices = useInvoices();
  const billing = useBillingProfile();
  const create = useCreateInvoice();
  const toast = useToast();
  const mine = invoices.data?.find((i) => i.period.startsWith(month));

  const action = (
    <>
      <Button
        size="sm"
        icon={Landmark}
        disabled={billing.isPending}
        data-testid="timesheets-billing"
        onClick={() => {
          onOpen(BILLING_ITEM);
        }}
      >
        {billing.data === null ? 'Set up billing' : 'Billing'}
      </Button>
      {billing.data && !mine ? <Button
        size="sm"
        icon={FilePlus2}
        loading={create.isPending}
        data-testid="invoice-new"
        onClick={() => {
          create.mutate(month, {
            onSuccess: onOpen,
            onError: (e) => {
              toast.show({ tone: 'error', message: messageOf(e) });
            },
          });
        }}
      >
        Invoice {monthLabel(month).split(' ')[0]}
      </Button> : null}
    </>
  );

  return (
    <Card title="Invoices" actions={action} padded={false} className="overflow-hidden">
      {invoices.isPending || billing.isPending ? <LoadingState label="Loading invoices" /> : null}
      {invoices.isError ? <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} /> : null}
      {billing.isError ? <ErrorState error={billing.error} onRetry={() => void billing.refetch()} /> : null}
      {invoices.data?.length === 0 ? <EmptyState icon={TOOL_META.timesheets.icon} title="No invoices yet." /> : null}
      {invoices.data && invoices.data.length > 0 ? (
        <InvoiceList rows={invoices.data} selectedId={selectedId} onOpen={onOpen} isPhone={isPhone} />
      ) : null}
    </Card>
  );
}
