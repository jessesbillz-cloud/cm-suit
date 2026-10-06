// The job's inspection calendar for a week (SPEC §13.2): live (refetches every 30 s), colors from lib/status, times
// and types for everyone, full detail only for my own requests (or all of them for the GC team and inspectors).
// Desktop: seven columns, today's tinted. Phone: the days one under another.
import { useIrCalendar } from '../../data/inspections.queries';
import type { CalendarRow } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { DayNav } from './DayNav';
import { EntryLine } from './EntryLine';
import { addDaysTo, daysFrom, weekOf } from './time';

interface WeekViewProps {
  projectId: string;
  day: string;
  today: string;
  selectedId: string | null;
  isPhone: boolean;
  /** I decide OFS requests (the deputy): the lines' words follow. */
  ofsDecide: boolean;
  onDay: (day: string) => void;
  onPickDay: (day: string) => void;
  onOpen: (id: string) => void;
}

interface DayColumnProps {
  day: string;
  today: string;
  current: string;
  rows: readonly CalendarRow[];
  selectedId: string | null;
  isPhone: boolean;
  ofsDecide: boolean;
  onPickDay: (day: string) => void;
  onOpen: (id: string) => void;
}

function dateMark(day: string, today: string, current: string): string {
  if (day === today) return 'bg-accent text-white';
  if (day === current) return 'text-accent ring-1 ring-accent/40';
  return 'text-ink';
}

function DayColumn({ day, today, current, rows, selectedId, isPhone, ofsDecide, onPickDay, onOpen }: DayColumnProps) {
  const isToday = day === today;
  const tint = isToday ? 'bg-accent-soft' : '';
  return (
    <section className={`flex min-w-0 flex-col ${isPhone ? '' : 'min-h-[280px]'} ${tint}`} data-testid={`ir-day-${day}`}>
      <button
        type="button"
        className={`flex items-center gap-2 text-left hover:bg-page/60 ${isPhone ? 'min-h-11 px-4 py-1.5' : 'border-b border-line px-2 py-2'}`}
        onClick={() => {
          onPickDay(day);
        }}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-ink">{formatDay(day, 'EEE')}</span>
        <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${dateMark(day, today, current)}`}>
          {formatDay(day, 'd')}
        </span>
        {isPhone ? <span className="text-sm text-ink-2">{formatDay(day, 'MMM')}</span> : null}
        {isPhone && isToday ? <span className="ml-auto text-xs font-medium text-accent">Today</span> : null}
      </button>
      {rows.length > 0 ? (
        <div className={`flex flex-col gap-1.5 ${isPhone ? 'px-4 pb-3' : 'p-1.5'}`}>
          {rows.map((r, i) => (
            <EntryLine
              key={r.id ?? `${day}-${String(i)}`}
              row={r}
              selected={r.id !== null && r.id === selectedId}
              ofsDecide={ofsDecide}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function WeekView({ projectId, day, today, selectedId, isPhone, ofsDecide, onDay, onPickDay, onOpen }: WeekViewProps) {
  const { from, to } = weekOf(day);
  const cal = useIrCalendar(projectId, from, to);
  const days = daysFrom(from, 7);
  const inWeek = today >= from && today <= to;
  const requests = cal.data?.filter((r) => !r.is_block).length ?? 0;

  return (
    <Card padded={false} className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <DayNav
          label={`${formatDay(from, 'MMM d')} – ${formatDay(to, 'MMM d')}`}
          onPrev={() => {
            onDay(addDaysTo(day, -7));
          }}
          onNext={() => {
            onDay(addDaysTo(day, 7));
          }}
          onToday={
            inWeek
              ? undefined
              : () => {
                  onDay(today);
                }
          }
        />
        {cal.data ? (
          <span className="text-sm tabular-nums text-ink-2">
            {requests === 0 ? 'Nothing booked' : requests === 1 ? '1 request' : `${String(requests)} requests`}
          </span>
        ) : null}
      </header>
      {cal.isPending ? <LoadingState label="Loading the week" /> : null}
      {cal.isError ? <ErrorState error={cal.error} onRetry={() => void cal.refetch()} /> : null}
      {cal.data ? (
        <div className={isPhone ? 'flex flex-col divide-y divide-line' : 'grid grid-cols-7 divide-x divide-line'}>
          {days.map((d) => (
            <DayColumn
              key={d}
              day={d}
              today={today}
              current={day}
              rows={cal.data.filter((r) => r.request_date === d)}
              selectedId={selectedId}
              isPhone={isPhone}
              ofsDecide={ofsDecide}
              onPickDay={onPickDay}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
