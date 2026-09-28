// The desktop week (7 columns) and day (one list) views. A day's "+" opens the add form for that day.
import { Plus } from 'lucide-react';
import type { CalendarLine } from '../../data/calendar.types';
import { formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { LineRow } from './LineRow';

export interface DaysProps {
  days: readonly string[];
  buckets: Map<string, CalendarLine[]>;
  today: string;
  showJob: boolean;
  selectedId: string | null;
  canAdd: boolean;
  onOpen: (line: CalendarLine) => void;
  onAdd: (day: string) => void;
}

interface AddButtonProps {
  day: string;
  onAdd: (day: string) => void;
  big?: boolean | undefined;
}

export function AddButton({ day, onAdd, big }: AddButtonProps) {
  return (
    <button
      type="button"
      data-testid={`cal-add-${day}`}
      aria-label={`Add on ${formatDay(day, 'EEE MMM d')}`}
      className={`flex shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-accent ${big === true ? 'h-11 w-11' : 'h-7 w-7'}`}
      onClick={() => {
        onAdd(day);
      }}
    >
      <Icon icon={Plus} size={big === true ? 20 : 16} />
    </button>
  );
}

export function WeekView({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  return (
    <div className="grid grid-cols-7 divide-x divide-line">
      {days.map((day) => (
        <div key={day} data-testid={`cal-day-${day}`} className="flex min-h-64 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-1 border-b border-line px-2 py-1.5">
            <span className={`text-xs ${day === today ? 'font-semibold text-accent' : 'text-ink-2'}`}>
              {formatDay(day, 'EEE')} <span className="text-sm">{formatDay(day, 'd')}</span>
            </span>
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
  );
}

export function DayView({ days, buckets, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  const day = days[0];
  if (day === undefined) return null;
  const lines = buckets.get(day) ?? [];
  return (
    <div data-testid={`cal-day-${day}`}>
      {canAdd ? (
        <div className="flex justify-end border-b border-line px-2 py-1">
          <AddButton day={day} onAdd={onAdd} />
        </div>
      ) : null}
      <div className="flex flex-col divide-y divide-line">
        {lines.map((line) => (
          <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="row" onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
