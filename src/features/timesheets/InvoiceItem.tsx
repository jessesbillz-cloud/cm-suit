// One invoice (right column; full screen on the phone): its lines as saved (job, hours, rate, amount), the total, the
// PDF in one click (and View, full screen), Draft / Sent / Paid set by hand, Update to price a draft again from today's hours, and Delete for a
// draft (with Undo; the number is kept for it).
import { Download, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import {
  invoicePdfUrl,
  useDeleteInvoice,
  useInvoicePdf,
  useRefreshInvoice,
  useRestoreInvoice,
  useSetInvoiceStatus,
} from '../../data/hours.mutations';
import { useInvoices } from '../../data/hours.queries';
import type { InvoiceRow } from '../../data/hours.types';
import { formatDay } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { hoursText, monthLabel } from '../../lib/timesheet';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { HEAD_ROW, TABLE, TD, TD_NUM, TH } from '../../ui/Table';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { INVOICE_STATUSES, invoiceChip, invoiceTitle } from './model';
import { useTimesheetsNav } from './useTimesheetsNav';

function Lines({ inv }: { inv: InvoiceRow }) {
  return (
    <table className={TABLE}>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} pl-4`}>Job</th>
          <th className={`${TH} w-16 text-right`}>Hours</th>
          <th className={`${TH} w-20 text-right`}>Rate</th>
          <th className={`${TH} w-28 pr-4 text-right`}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {inv.lines.map((l) => (
          <tr key={l.project_id} className="border-b border-line">
            <td className={`${TD} whitespace-normal break-words pl-4 text-ink`}>{l.job}</td>
            <td className={`${TD_NUM} text-right text-ink-2`}>{hoursText(l.hours)}</td>
            <td className={`${TD_NUM} text-right text-ink-2`}>{formatMoney(l.rate)}</td>
            <td className={`${TD_NUM} pr-4 text-right text-ink`}>{formatMoney(l.amount)}</td>
          </tr>
        ))}
        <tr className="bg-card-head">
          <td className={`${TD} pl-4 text-[12px] font-medium uppercase tracking-wide text-ink-3`}>Total</td>
          <td className={`${TD_NUM} text-right font-semibold text-ink`}>{hoursText(inv.total_hours)}</td>
          <td />
          <td className={`${TD_NUM} pr-4 text-right text-[15px] font-semibold text-ink`} data-testid="invoice-total">
            {formatMoney(inv.total_amount)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Invoice({ inv }: { inv: InvoiceRow }) {
  const pdf = useInvoicePdf();
  const refresh = useRefreshInvoice();
  const status = useSetInvoiceStatus();
  const remove = useDeleteInvoice();
  const restore = useRestoreInvoice();
  const nav = useTimesheetsNav();
  const toast = useToast();
  const viewer = useFileViewer();
  const chip = invoiceChip(inv.status);
  const fail = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  return (
    <div className="flex flex-col gap-4 py-4" data-testid="invoice-item">
      <header className="px-4">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
          {invoiceTitle(inv)}
          <StatusChip status={chip.status} label={chip.label} />
        </h2>
        <p className="text-sm text-ink-2">
          {monthLabel(inv.period.slice(0, 7))} · {formatDay(inv.issued_on, 'MMM d, yyyy')}
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2 px-4">
        <Button
          variant="primary"
          icon={Download}
          loading={pdf.isPending}
          data-testid="invoice-pdf"
          onClick={() => {
            pdf.mutate(inv.id, { onError: fail });
          }}
        >
          Download
        </Button>
        <Button
          icon={Eye}
          data-testid="invoice-view"
          onClick={() => {
            viewer.open([
              {
                // A new version after Update shows the new rendering.
                id: `invoice:${inv.id}:${String(inv.version)}`,
                name: `${invoiceTitle(inv)}.pdf`,
                kind: 'pdf',
                url: () => invoicePdfUrl(inv.id),
                download: () => pdf.mutateAsync(inv.id),
              },
            ]);
          }}
        >
          View
        </Button>
        {inv.status === 'draft' ? (
          <Button
            icon={RefreshCw}
            loading={refresh.isPending}
            data-testid="invoice-refresh"
            onClick={() => {
              refresh.mutate(
                { id: inv.id, version: inv.version },
                {
                  onSuccess: () => {
                    toast.show({ message: 'Invoice updated.' });
                  },
                  onError: fail,
                },
              );
            }}
          >
            Update
          </Button>
        ) : null}
        {inv.status === 'draft' ? (
          <Button
            variant="danger"
            icon={Trash2}
            loading={remove.isPending}
            data-testid="invoice-delete"
            onClick={() => {
              // The promise, not per-call callbacks: the list drops this invoice (and this pane) before they would run.
              remove.mutateAsync({ id: inv.id, version: inv.version }).then(() => {
                nav.close();
                toast.show({
                  message: `${invoiceTitle(inv)} deleted.`,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restore.mutateAsync(inv.id).catch(fail);
                    },
                  },
                });
              }, fail);
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <div className="px-4">
        <Segments
          kind="radio"
          label="Invoice status"
          testId="invoice-status"
          options={INVOICE_STATUSES}
          value={inv.status}
          onPick={(next) => {
            if (next !== inv.status && !status.isPending) status.mutate({ id: inv.id, version: inv.version, status: next }, { onError: fail });
          }}
        />
      </div>
      <div className="border-y border-line">
        <Lines inv={inv} />
      </div>
      {inv.bill_to !== '' ? (
        <div className="px-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Bill to</p>
          <p className="whitespace-pre-line text-sm text-ink">{inv.bill_to}</p>
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceItem({ invoiceId }: { invoiceId: string }) {
  const invoices = useInvoices();
  if (invoices.isPending) return <LoadingState label="Loading invoice" />;
  if (invoices.isError) return <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />;
  const inv = invoices.data.find((i) => i.id === invoiceId);
  if (!inv) return <EmptyState icon={TOOL_META.timesheets.icon} title="That invoice is not here." />;
  return <Invoice inv={inv} />;
}
