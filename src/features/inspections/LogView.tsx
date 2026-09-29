// The inspection log (SPEC §7.4, §13.2) by week or month: number, full title (wraps), the day asked for and the day
// of the result; click a column to sort. Postponements count as extra requests. Zips come later. On the phone the log
// is a list: one row per request, the title on top and the dates under it.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useIrLog } from '../../data/inspections.queries';
import type { IrRequest } from '../../data/inspections.types';
import { formatDay, formatInZone, fromZonedInput } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { LogTable, type LogRow } from '../../ui/LogTable';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { DayNav } from './DayNav';
import { logTitle, requestChip, requestCount } from './model';
import { addDaysTo, monthOf, weekOf } from './time';

type Period = 'week' | 'month';
const PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

const SELECTED = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

interface LogViewProps {
  projectId: string;
  tz: string;
  day: string;
  selectedId: string | null;
  isPhone: boolean;
  onOpen: (id: string) => void;
}

function shift(period: Period, day: string, dir: 1 | -1): string {
  if (period === 'week') return addDaysTo(day, 7 * dir);
  const { from, to } = monthOf(day);
  return dir === 1 ? addDaysTo(to, 1) : addDaysTo(from, -1);
}

interface LogListProps {
  rows: readonly IrRequest[];
  tz: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

/** The phone's log: no columns, one tappable row per request, newest number first. */
function LogList({ rows, tz, selectedId, onOpen }: LogListProps) {
  const sorted = [...rows].sort((a, b) => b.number - a.number);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((r) => {
        const chip = requestChip(r);
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid={`log-row-${String(r.number)}`}
              className={`flex min-h-[52px] w-full items-start gap-3 px-4 py-3 text-left ${r.id === selectedId ? SELECTED : 'hover:bg-page/60'}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-10 shrink-0 pt-px text-sm font-medium tabular-nums text-ink">{r.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm text-ink">{logTitle(r)}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                  <StatusChip status={chip.status} label={chip.label} />
                  {formatDay(r.request_date, 'MMM d')}
                  {r.result_at ? ` · ${formatInZone(r.result_at, tz, 'MMM d')}` : ''}
                </span>
              </span>
              <Icon icon={ChevronRight} size={16} className="mt-0.5 shrink-0 text-ink-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function LogView({ projectId, tz, day, selectedId, isPhone, onOpen }: LogViewProps) {
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
    <Card padded={false} className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <Segments kind="radio" label="Period" options={PERIODS} value={period} onPick={setPeriod} testId="ir-log-period" />
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
          <span className="text-sm tabular-nums text-ink-2 sm:ml-auto" data-testid="ir-log-count">
            {count.requests} requests{count.postponed > 0 ? ` · ${String(count.postponed)} postponed` : ''}
          </span>
        ) : null}
      </header>
      {log.isPending ? <LoadingState label="Loading the log" /> : null}
      {log.isError ? <ErrorState error={log.error} onRetry={() => void log.refetch()} /> : null}
      {log.data?.length === 0 ? (
        <EmptyState icon={TOOL_META.inspections.icon} title={period === 'week' ? 'No inspections this week.' : 'No inspections this month.'} />
      ) : null}
      {log.data && log.data.length > 0 ? (
        isPhone ? (
          <LogList rows={log.data} tz={tz} selectedId={selectedId} onOpen={onOpen} />
        ) : (
          <div className="p-4">
            <LogTable rows={rows} timeZone={tz} onOpen={onOpen} selectedId={selectedId} label="inspections" />
          </div>
        )
      ) : null}
    </Card>
  );
}
