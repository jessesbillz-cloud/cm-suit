// The three-week board (SPEC §13.3): Sunday-first weeks, each day with its delivery count as a small accent badge.
// Today wears a ring, the picked day the accent tint, weekends sit a shade back. Tap a day for its deliveries.
import { ChevronLeft, ChevronRight, Truck } from 'lucide-react';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ThreeWeekGridProps {
  days: readonly string[];
  counts: ReadonlyMap<string, number>;
  today: string;
  selected: string;
  onPick: (day: string) => void;
  /** Moves the three weeks by whole weeks (-1 / +1). */
  onShift: (weeks: number) => void;
  onToday: () => void;
}

interface CellProps {
  day: string;
  first: boolean;
  weekend: boolean;
  count: number;
  isToday: boolean;
  isPast: boolean;
  isSelected: boolean;
  onPick: (day: string) => void;
}

function cellTone(isSelected: boolean, weekend: boolean): string {
  if (isSelected) return 'border-accent bg-accent-soft ring-1 ring-accent';
  return weekend ? 'border-line bg-card-head hover:border-line-strong' : 'border-line bg-card hover:border-line-strong hover:bg-page/40';
}

function DayCell({ day, first, weekend, count, isToday, isPast, isSelected, onPick }: CellProps) {
  // The first cell and each 1st carry the month; a phone cell is too narrow, and the range above already says it.
  const month = first || day.endsWith('-01') ? <span className="mr-1 hidden sm:inline">{formatDay(day, 'MMM')}</span> : null;
  const date = isToday
    ? 'bg-card font-semibold text-accent ring-2 ring-accent'
    : `font-medium ${isPast || weekend ? 'text-ink-3' : isSelected ? 'text-accent' : 'text-ink-2'}`;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${formatDay(day, 'EEE MMM d')}: ${String(count)} ${count === 1 ? 'delivery' : 'deliveries'}`}
      data-testid={`delivery-day-${day}`}
      className={`flex h-[68px] min-w-0 flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-colors sm:h-20 sm:p-2 ${cellTone(isSelected, weekend)}`}
      onClick={() => {
        onPick(day);
      }}
    >
      <span className={`inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-full px-1.5 text-xs tabular-nums ${date}`}>
        {month}
        {formatDay(day, 'd')}
      </span>
      {count > 0 ? (
        <span
          className={`inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-xs font-semibold tabular-nums sm:px-2 ${
            isSelected ? 'bg-accent text-white' : 'bg-accent-soft text-accent'
          }`}
          data-testid="delivery-day-count"
        >
          <Icon icon={Truck} size={13} className="hidden sm:block" />
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function ThreeWeekGrid({ days, counts, today, selected, onPick, onShift, onToday }: ThreeWeekGridProps) {
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[15px] font-semibold tabular-nums text-ink">
          {formatDay(first, 'MMM d')} – {formatDay(last, 'MMM d')}
        </p>
        <div className="flex overflow-hidden rounded-md border border-line bg-card">
          <Button
            size="sm"
            variant="quiet"
            icon={ChevronLeft}
            aria-label="Earlier week"
            className="!rounded-none"
            onClick={() => {
              onShift(-1);
            }}
          />
          <span aria-hidden className="w-px bg-line" />
          <Button
            size="sm"
            variant="quiet"
            icon={ChevronRight}
            aria-label="Later week"
            className="!rounded-none"
            onClick={() => {
              onShift(1);
            }}
          />
        </div>
        <Button size="sm" onClick={onToday}>
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-label="Three weeks">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`pb-0.5 text-center text-[11px] font-medium uppercase tracking-wide ${i === 0 || i === 6 ? 'text-ink-3/80' : 'text-ink-3'}`}
            aria-hidden="true"
          >
            {w}
          </div>
        ))}
        {days.map((d, i) => (
          <DayCell
            key={d}
            day={d}
            first={i === 0}
            weekend={i % 7 === 0 || i % 7 === 6}
            count={counts.get(d) ?? 0}
            isToday={d === today}
            isPast={d < today}
            isSelected={d === selected}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}
