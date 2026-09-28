// The job's inspection calendar for a week (SPEC §13.2): live (refetches every 30 s), colors from lib/status, times
// and types for everyone, full detail only for my own requests (or all of them for the GC team and inspectors).
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
  onPickDay: (day: string) => void;
  onOpen: (id: string) => void;
}

function DayColumn({ day, today, current, rows, selectedId, isPhone, onPickDay, onOpen }: DayColumnProps) {
  const isToday = day === today;
  return (
    <section className={`flex min-w-0 flex-col gap-1.5 p-2 ${isPhone ? 'border-b border-line' : ''}`} data-testid={`ir-day-${day}`}>
      <button
        type="button"
        className={`rounded px-1 text-left text-xs font-medium ${day === current ? 'text-accent' : isToday ? 'text-ink' : 'text-ink-2'} hover:text-accent`}
        onClick={() => {
          onPickDay(day);
        }}
      >
        {formatDay(day, isPhone ? 'EEEE, MMM d' : 'EEE d')}
        {isToday ? ' · Today' : ''}
      </button>
      {rows.map((r, i) => (
        <EntryLine key={r.id ?? `${day}-${String(i)}`} row={r} selected={r.id !== null && r.id === selectedId} onOpen={onOpen} />
      ))}
    </section>
  );
}

export function WeekView({ projectId, day, today, selectedId, isPhone, onDay, onPickDay, onOpen }: WeekViewProps) {
  const { from, to } = weekOf(day);
  const cal = useIrCalendar(projectId, from, to);
  const days = daysFrom(from, 7);
  const inWeek = today >= from && today <= to;

  return (
    <Card padded={false}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
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
      </header>
      {cal.isPending ? <LoadingState label="Loading the week" /> : null}
      {cal.isError ? <ErrorState error={cal.error} onRetry={() => void cal.refetch()} /> : null}
      {cal.data ? (
        <>
          {cal.data.length === 0 ? <p className="px-4 pt-3 text-sm text-ink-2">Nothing booked this week.</p> : null}
          <div className={isPhone ? 'flex flex-col' : 'grid grid-cols-7 divide-x divide-line'}>
            {days.map((d) => (
              <DayColumn
                key={d}
                day={d}
                today={today}
                current={day}
                rows={cal.data.filter((r) => r.request_date === d)}
                selectedId={selectedId}
                isPhone={isPhone}
                onPickDay={onPickDay}
                onOpen={onOpen}
              />
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
