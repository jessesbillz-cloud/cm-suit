// The inspection log (SPEC §7.4, §13.2) by week or month: number, full title (wraps), the day asked for and the day
// of the result; click a column to sort. Postponements count as extra requests. Zips come later.
import { useState } from 'react';
import { useIrLog } from '../../data/inspections.queries';
import { formatDay, fromZonedInput } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { LogTable, type LogRow } from '../../ui/LogTable';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ChoiceRow } from './ChoiceRow';
import { DayNav } from './DayNav';
import { logTitle, requestCount } from './model';
import { addDaysTo, monthOf, weekOf } from './time';

type Period = 'week' | 'month';
const PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

interface LogViewProps {
  projectId: string;
  tz: string;
  day: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function shift(period: Period, day: string, dir: 1 | -1): string {
  if (period === 'week') return addDaysTo(day, 7 * dir);
  const { from, to } = monthOf(day);
  return dir === 1 ? addDaysTo(to, 1) : addDaysTo(from, -1);
}

export function LogView({ projectId, tz, day, selectedId, onOpen }: LogViewProps) {
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(day);
  const range = period === 'week' ? weekOf(anchor) : monthOf(anchor);
  const log = useIrLog(projectId, range.from, range.to);

  const rows: LogRow[] = (log.data ?? []).map((r) => ({
    id: r.id,
    number: String(r.number),
    title: logTitle(r),
    // The day asked for, as noon in the job's zone so it shows as that day.
    askedAt: fromZonedInput(`${r.request_date}T12:00`, tz),
    answeredAt: r.result_at,
  }));
  const count = requestCount(log.data ?? []);
  const label = period === 'week' ? `${formatDay(range.from, 'MMM d')} – ${formatDay(range.to, 'MMM d')}` : formatDay(range.from, 'MMMM yyyy');

  return (
    <Card padded={false}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <ChoiceRow label="Period" options={PERIODS} value={period} onPick={setPeriod} />
        <DayNav
          label={label}
          onPrev={() => {
            setAnchor(shift(period, anchor, -1));
          }}
          onNext={() => {
            setAnchor(shift(period, anchor, 1));
          }}
        />
        {log.data && log.data.length > 0 ? (
          <span className="text-sm text-ink-2" data-testid="ir-log-count">
            {count.requests} requests{count.postponed > 0 ? ` · ${String(count.postponed)} postponed` : ''}
          </span>
        ) : null}
      </header>
      {log.isPending ? <LoadingState label="Loading the log" /> : null}
      {log.isError ? <ErrorState error={log.error} onRetry={() => void log.refetch()} /> : null}
      {log.data?.length === 0 ? <EmptyState title={period === 'week' ? 'No inspections this week.' : 'No inspections this month.'} /> : null}
      {log.data && log.data.length > 0 ? (
        <div className="p-3">
          <LogTable rows={rows} timeZone={tz} onOpen={onOpen} selectedId={selectedId} label="inspections" />
        </div>
      ) : null}
    </Card>
  );
}
