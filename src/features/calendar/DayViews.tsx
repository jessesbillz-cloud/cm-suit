// The desktop week (7 columns) and day (one list) views. A day's "+" opens the add form for that day. Today's date
// sits in an accent circle; weekends are drawn lighter.
import { Plus } from 'lucide-react';
import type { CalendarLine } from '../../data/calendar.types';
import { formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { LineRow } from './LineRow';
import { isWeekendDay } from './model';

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
      className={`flex shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-accent-soft hover:text-accent ${big === true ? 'h-11 w-11' : 'h-7 w-7'}`}
      onClick={() => {
        onAdd(day);
      }}
    >
      <Icon icon={Plus} size={big === true ? 20 : 16} />
    </button>
  );
}

/** The date number: an accent circle on today, lighter on weekends and on days outside the month. */
export function DateNumber({ day, today, dim }: { day: string; today: string; dim: boolean }) {
  const tone = day === today ? 'bg-accent text-white' : dim ? 'text-ink-3' : 'text-ink';
  return (
    <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[15px] font-semibold tabular-nums ${tone}`}>
      {formatDay(day, 'd')}
    </span>
  );
}

/** "MON" over the week's columns and the month's header row. */
export function Weekday({ day, today }: { day: string; today: string }) {
  const tone = day === today ? 'text-accent' : isWeekendDay(day) ? 'text-ink-3' : 'text-ink-2';
  return <span className={`text-[12px] font-medium uppercase tracking-wide ${tone}`}>{formatDay(day, 'EEE')}</span>;
}

export function WeekView({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  return (
    <div className="grid grid-cols-7 divide-x divide-line">
      {days.map((day) => {
        const tint = day === today ? 'bg-accent-soft/30' : isWeekendDay(day) ? 'bg-page/50' : '';
        return (
          <div key={day} data-testid={`cal-day-${day}`} className={`flex min-h-72 min-w-0 flex-col ${tint}`}>
            <div className="flex h-12 items-center justify-between gap-1 border-b border-line pl-2.5 pr-1.5">
              <span className="flex items-center gap-1.5">
                <Weekday day={day} today={today} />
                <DateNumber day={day} today={today} dim={isWeekendDay(day)} />
              </span>
              {canAdd ? <AddButton day={day} onAdd={onAdd} /> : null}
            </div>
            <div className="flex flex-col gap-1 p-1.5">
              {(buckets.get(day) ?? []).map((line) => (
                <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="compact" onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DayView({ days, buckets, today, showJob, selectedId, canAdd, onOpen, onAdd }: DaysProps) {
  const day = days[0];
  if (day === undefined) return null;
  const lines = buckets.get(day) ?? [];
  return (
    <div data-testid={`cal-day-${day}`}>
      <div className="flex h-12 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
        <span className="flex items-center gap-2">
          <Weekday day={day} today={today} />
          <DateNumber day={day} today={today} dim={isWeekendDay(day)} />
        </span>
        {canAdd ? <AddButton day={day} onAdd={onAdd} /> : null}
      </div>
      <div className="flex flex-col divide-y divide-line">
        {lines.map((line) => (
          <LineRow key={line.id} line={line} showJob={showJob} selected={line.id === selectedId} variant="row" onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
