// A week of days, the ONE frame the job's inspection week (WeekView) and the fire marshal's OFS schedule (OfsSchedule)
// both draw: the week's dates with Previous / Next / Today and a count, then seven columns (today tinted) on a desktop,
// or the days one under another on a phone. What sits in a day is the caller's.
import type { ReactNode } from 'react';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { DayNav } from './DayNav';
import { addDaysTo, daysFrom, weekOf } from './time';

interface WeekFrameProps {
  day: string;
  today: string;
  isPhone: boolean;
  /** "3 requests", shown once loaded. */
  count: string | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onDay: (day: string) => void;
  /** A day's header opens that day (null: the header is only a label). */
  onPickDay: ((day: string) => void) | null;
  renderDay: (day: string) => ReactNode;
}

interface DayColumnProps {
  day: string;
  today: string;
  current: string;
  isPhone: boolean;
  onPickDay: ((day: string) => void) | null;
  children: ReactNode;
}

function dateMark(day: string, today: string, current: string): string {
  if (day === today) return 'bg-accent text-white';
  if (day === current) return 'text-accent ring-1 ring-accent/40';
  return 'text-ink';
}

function DayColumn({ day, today, current, isPhone, onPickDay, children }: DayColumnProps) {
  const isToday = day === today;
  const head = `flex items-center gap-2 text-left ${isPhone ? 'min-h-11 px-4 py-1.5' : 'border-b border-line px-2 py-2'}`;
  const label = (
    <>
      <span className="text-xs font-bold uppercase tracking-wide text-ink">{formatDay(day, 'EEE')}</span>
      <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${dateMark(day, today, current)}`}>
        {formatDay(day, 'd')}
      </span>
      {isPhone ? <span className="text-sm text-ink-2">{formatDay(day, 'MMM')}</span> : null}
      {isPhone && isToday ? <span className="ml-auto text-xs font-medium text-accent">Today</span> : null}
    </>
  );
  return (
    <section className={`flex min-w-0 flex-col ${isPhone ? '' : 'min-h-[280px]'} ${isToday ? 'bg-accent-soft' : ''}`} data-testid={`ir-day-${day}`}>
      {onPickDay ? (
        <button
          type="button"
          className={`${head} hover:bg-page/60`}
          onClick={() => {
            onPickDay(day);
          }}
        >
          {label}
        </button>
      ) : (
        <div className={head}>{label}</div>
      )}
      {children}
    </section>
  );
}

export function WeekFrame({ day, today, isPhone, count, loading, error, onRetry, onDay, onPickDay, renderDay }: WeekFrameProps) {
  const { from, to } = weekOf(day);
  const inWeek = today >= from && today <= to;
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
        {count !== null ? <span className="text-sm tabular-nums text-ink-2">{count}</span> : null}
      </header>
      {loading ? <LoadingState label="Loading the week" /> : null}
      {error ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {!loading && !error ? (
        <div className={isPhone ? 'flex flex-col divide-y divide-line' : 'grid grid-cols-7 divide-x divide-line'}>
          {daysFrom(from, 7).map((d) => (
            <DayColumn key={d} day={d} today={today} current={day} isPhone={isPhone} onPickDay={onPickDay}>
              {renderDay(d)}
            </DayColumn>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
