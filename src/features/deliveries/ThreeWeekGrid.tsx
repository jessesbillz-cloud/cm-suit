// The three-week board (SPEC §13.3): Sunday-first weeks, each day with its delivery count. Tap a day for its cards.
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

export function ThreeWeekGrid({ days, counts, today, selected, onPick, onShift, onToday }: ThreeWeekGridProps) {
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="quiet" icon={ChevronLeft} aria-label="Earlier week" onClick={() => {
            onShift(-1);
          }} />
        <p className="min-w-0 flex-1 text-center text-sm font-medium text-ink">
          {formatDay(first, 'MMM d')} – {formatDay(last, 'MMM d')}
        </p>
        <Button size="sm" variant="quiet" icon={ChevronRight} aria-label="Later week" onClick={() => {
            onShift(1);
          }} />
        <Button size="sm" onClick={onToday}>
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1" aria-label="Three weeks">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs font-medium text-ink-3" aria-hidden="true">
            {w}
          </div>
        ))}
        {days.map((d, i) => {
          const n = counts.get(d) ?? 0;
          const isSelected = d === selected;
          const label = i === 0 || d.endsWith('-01') ? formatDay(d, 'MMM d') : formatDay(d, 'd');
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${formatDay(d, 'EEE MMM d')}: ${String(n)} ${n === 1 ? 'delivery' : 'deliveries'}`}
              data-testid={`delivery-day-${d}`}
              className={`flex h-16 flex-col items-start justify-between rounded-md border px-1.5 py-1 text-left sm:h-20 ${
                isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:bg-page'
              } ${d < today ? 'opacity-60' : ''}`}
              onClick={() => {
                onPick(d);
              }}
            >
              <span className={`text-xs ${d === today ? 'rounded bg-accent px-1 font-semibold text-white' : 'text-ink-2'}`}>{label}</span>
              {n > 0 ? (
                <span className="flex items-center gap-1 text-sm font-semibold text-ink" data-testid="delivery-day-count">
                  <Icon icon={Truck} size={14} className="text-ink-2" />
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
