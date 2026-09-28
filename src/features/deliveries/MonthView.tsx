// Month: the summary of one month (by day, with totals), printable, and "I reviewed this month" for deliveries.manage.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useDeliveries } from '../../data/deliveries.queries';
import { formatDay } from '../../lib/dates';
import { monthDays, shiftDay } from '../../lib/deliveries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
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
}

export function MonthView({ projectId, projectName, tz, day, canManage, onPickDay }: MonthViewProps) {
  const days = monthDays(day);
  const first = days[0] ?? day;
  const last = days[days.length - 1] ?? day;
  const rows = useDeliveries(projectId, first, last);
  const [printing, setPrinting] = useState(false);
  const title = formatDay(first, 'MMMM yyyy');

  return (
    <Card
      title={
        <span className="flex items-center gap-1">
          <Button size="sm" variant="quiet" icon={ChevronLeft} aria-label="Earlier month" onClick={() => {
              onPickDay(shiftDay(first, -1));
            }} />
          <span className="min-w-32 text-center">{title}</span>
          <Button size="sm" variant="quiet" icon={ChevronRight} aria-label="Later month" onClick={() => {
              onPickDay(shiftDay(last, 1));
            }} />
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
      {rows.data?.length === 0 ? <EmptyState title="No deliveries this month." /> : null}
      {rows.data && rows.data.length > 0 ? <MonthSummary rows={rows.data} tz={tz} /> : null}
      {canManage ? (
        <div className="mt-4 border-t border-line pt-4">
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
