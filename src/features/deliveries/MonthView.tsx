// Month: the summary of one month (by day, with totals; a row opens its delivery), printable, and "I reviewed this
// month" for deliveries.manage.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useDeliveries } from '../../data/deliveries.queries';
import { formatDay } from '../../lib/dates';
import { monthDays, shiftDay } from '../../lib/deliveries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { MonthReview } from './MonthReview';
import { MonthSummary } from './MonthSummary';
import { PrintSheet } from './PrintSheet';

interface MonthViewProps {
  projectId: string;
  projectName: string;
  tz: string;
  /** Any day of the month to show. */
  day: string;
  canManage: boolean;
  onPickDay: (day: string) => void;
  /** Opens a delivery in the right column; the board behind it shows the delivery's day. */
  onOpen: (id: string, day: string) => void;
  selectedId: string | null;
}

export function MonthView({ projectId, projectName, tz, day, canManage, onPickDay, onOpen, selectedId }: MonthViewProps) {
  const days = monthDays(day);
  const first = days[0] ?? day;
  const last = days[days.length - 1] ?? day;
  const rows = useDeliveries(projectId, first, last);
  const [printing, setPrinting] = useState(false);
  const title = formatDay(first, 'MMMM yyyy');

  return (
    <Card
      padded={false}
      className="overflow-hidden"
      title={
        <span className="flex items-center gap-3">
          <span className="flex overflow-hidden rounded-md border border-line bg-card">
            <Button size="sm" variant="quiet" icon={ChevronLeft} aria-label="Earlier month" className="!rounded-none" onClick={() => {
                onPickDay(shiftDay(first, -1));
              }} />
            <span aria-hidden className="w-px bg-line" />
            <Button size="sm" variant="quiet" icon={ChevronRight} aria-label="Later month" className="!rounded-none" onClick={() => {
                onPickDay(shiftDay(last, 1));
              }} />
          </span>
          <span>{title}</span>
        </span>
      }
      actions={
        <Button size="sm" icon={Printer} disabled={!rows.data} onClick={() => {
            setPrinting(true);
          }}>
          Print
        </Button>
      }
    >
      {rows.isPending ? <LoadingState label="Loading the month" /> : null}
      {rows.isError ? <ErrorState error={rows.error} onRetry={() => void rows.refetch()} /> : null}
      {rows.data?.length === 0 ? <EmptyState icon={TOOL_META.deliveries.icon} title="No deliveries this month." /> : null}
      {rows.data && rows.data.length > 0 ? <MonthSummary rows={rows.data} tz={tz} onOpen={onOpen} selectedId={selectedId} /> : null}
      {canManage ? (
        <div className="border-t border-line p-4">
          <MonthReview projectId={projectId} month={first} tz={tz} />
        </div>
      ) : null}
      {printing && rows.data ? (
        <PrintSheet
          onClose={() => {
            setPrinting(false);
          }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-ink-2">{projectName}</p>
              <h1 className="text-2xl font-semibold text-ink">Deliveries, {title}</h1>
            </div>
            <MonthSummary rows={rows.data} tz={tz} />
          </div>
        </PrintSheet>
      ) : null}
    </Card>
  );
}
