// The month view: whole weeks, Monday first. A date opens that day; "+" adds on it. Every line shows in full.
import { formatDay } from '../../lib/dates';
import { AddButton, type DaysProps } from './DayViews';
import { LineRow } from './LineRow';

interface MonthViewProps extends DaysProps {
  /** yyyy-MM: days outside it are dimmed. */
  month: string;
  onShowDay: (day: string) => void;
}

export function MonthView({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd, month, onShowDay }: MonthViewProps) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2 py-1.5 text-xs text-ink-2">
            {formatDay(day, 'EEE')}
          </div>
        ))}
      </div>
      {/* 1px gaps over a line-colored background draw the grid. */}
      <div className="grid grid-cols-7 gap-px bg-line">
        {days.map((day) => (
          <div key={day} data-testid={`cal-day-${day}`} className={`flex min-h-28 min-w-0 flex-col ${day.startsWith(month) ? 'bg-card' : 'bg-page'}`}>
            <div className="flex items-center justify-between px-1 pt-1">
              <button
                type="button"
                aria-label={formatDay(day, 'EEE MMM d')}
                className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-sm hover:bg-page ${
                  day === today ? 'font-semibold text-accent' : day.startsWith(month) ? 'text-ink' : 'text-ink-3'
                }`}
                onClick={() => {
                  onShowDay(day);
                }}
              >
                {formatDay(day, 'd')}
              </button>
              {canAdd ? <AddButton day={day} onAdd={onAdd} /> : null}
            </div>
            <div className="flex flex-col gap-0.5 p-1">
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
