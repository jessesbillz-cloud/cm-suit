// The month view: whole weeks, Monday first. A date opens that day; "+" adds on it. Every line shows in full.
// Weekends are lighter; days outside the month are dimmed.
import { formatDay } from '../../lib/dates';
import { AddButton, DateNumber, Weekday, type DaysProps } from './DayViews';
import { LineRow } from './LineRow';
import { isWeekendDay } from './model';

interface MonthViewProps extends DaysProps {
  /** yyyy-MM: days outside it are dimmed. */
  month: string;
  onShowDay: (day: string) => void;
}

function cellTone(day: string, month: string): string {
  if (!day.startsWith(month)) return 'bg-page';
  return isWeekendDay(day) ? 'bg-card-head' : 'bg-card';
}

export function MonthView({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd, month, onShowDay }: MonthViewProps) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2.5 py-2">
            {/* A column label, so it never takes today's accent. */}
            <Weekday day={day} today="" />
          </div>
        ))}
      </div>
      {/* 1px gaps over a line-colored background draw the grid. */}
      <div className="grid grid-cols-7 gap-px rounded-b-card bg-line">
        {days.map((day) => (
          <div key={day} data-testid={`cal-day-${day}`} className={`flex min-h-32 min-w-0 flex-col ${cellTone(day, month)}`}>
            <div className="flex items-center justify-between px-1.5 pt-1.5">
              <button
                type="button"
                aria-label={formatDay(day, 'EEE MMM d')}
                className="rounded-full hover:bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => {
                  onShowDay(day);
                }}
              >
                <DateNumber day={day} today={today} dim={!day.startsWith(month) || isWeekendDay(day)} />
              </button>
              {canAdd ? <AddButton day={day} onAdd={onAdd} /> : null}
            </div>
            <div className="flex flex-col gap-1 p-1.5">
              {(buckets.get(day) ?? []).map((line) => (
                <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="compact" onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
