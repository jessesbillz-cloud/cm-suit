// The phone calendar (SPEC §7.7): the week as one list, a day header over its lines, big targets.
import { formatDay } from '../../lib/dates';
import { AddButton, type DaysProps } from './DayViews';
import { LineRow } from './LineRow';

export function PhoneAgenda({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  return (
    <div className="flex flex-col">
      {days.map((day) => {
        const lines = buckets.get(day) ?? [];
        return (
          <section key={day} data-testid={`cal-day-${day}`} className="border-b border-line last:border-b-0">
            <header className="flex items-center justify-between bg-page px-3 py-1">
              <h3 className={`text-sm ${day === today ? 'font-semibold text-accent' : 'font-medium text-ink'}`}>
                {formatDay(day, 'EEE, MMM d')}
              </h3>
              {canAdd ? <AddButton day={day} onAdd={onAdd} big /> : null}
            </header>
            <div className="flex flex-col divide-y divide-line">
              {lines.map((line) => (
                <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="row" onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
