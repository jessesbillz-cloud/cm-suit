// The phone calendar (SPEC §7.7): the week as one list, a day header over its lines, big targets.
import { formatDay } from '../../lib/dates';
import { AddButton, DateNumber, Weekday, type DaysProps } from './DayViews';
import { LineRow } from './LineRow';
import { isWeekendDay } from './model';

export function PhoneAgenda({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  return (
    <div className="flex flex-col">
      {days.map((day) => {
        const lines = buckets.get(day) ?? [];
        return (
          <section key={day} data-testid={`cal-day-${day}`} className="border-b border-line last:border-b-0">
            <header className={`flex min-h-11 items-center justify-between gap-2 bg-card-head pl-4 pr-1 ${lines.length > 0 ? 'border-b border-line' : ''}`}>
              <h3 className="flex items-center gap-2">
                <Weekday day={day} today={today} />
                <DateNumber day={day} today={today} dim={isWeekendDay(day)} />
                <span className={`text-sm ${day === today ? 'font-medium text-accent' : 'text-ink-2'}`}>{formatDay(day, 'MMM')}</span>
              </h3>
              {canAdd ? <AddButton day={day} onAdd={onAdd} big /> : null}
            </header>
            {lines.length > 0 ? (
              <div className="flex flex-col divide-y divide-line">
                {lines.map((line) => (
                  <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="row" onOpen={onOpen} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
