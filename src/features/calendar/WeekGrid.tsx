// The week: seven columns, Monday first, every entry in full as a banner with its time (and job on "All my jobs").
// A request opens in the right column; a line opens where it lives; a column's date opens that day below (again: closes).
import { formatDay } from '../../lib/dates';
import { clockLabel } from '../inspections/time';
import { Banner } from './Banner';
import { bannerOf, isLookahead, type Entry } from './entries';
import { isWeekendDay, lineTime } from './model';

interface WeekGridProps {
  days: readonly string[];
  byDay: Map<string, Entry[]>;
  today: string;
  /** The open day, or null. */
  selected: string | null;
  showJob: boolean;
  onSelect: (day: string) => void;
  onOpen: (entry: Entry) => void;
}

function timeOf(e: Entry): string {
  if (e.type === 'line') return lineTime(e.line);
  if (e.row.duration_kind === 'all_day') return 'All day';
  return clockLabel(e.row.start_time);
}

export function WeekGrid({ days, byDay, today, selected, showJob, onSelect, onOpen }: WeekGridProps) {
  return (
    <div className="grid grid-cols-7 divide-x divide-line">
      {days.map((day) => {
        const isSel = day === selected;
        const tint = isSel ? 'bg-accent-soft/50' : isWeekendDay(day) ? 'bg-card-head' : '';
        return (
          <div key={day} data-testid={`cal-day-${day}`} className={`flex min-h-80 min-w-0 flex-col ${tint}`}>
            <button
              type="button"
              aria-pressed={isSel}
              className={`flex h-12 items-center justify-center gap-1.5 border-b border-line hover:bg-page/60 ${
                isSel ? 'shadow-[inset_0_-2px_0_theme(colors.accent.DEFAULT)]' : ''
              }`}
              onClick={() => {
                onSelect(day);
              }}
            >
              <span className={`text-[12px] font-medium uppercase tracking-wide ${day === today ? 'text-accent' : 'text-ink-2'}`}>
                {formatDay(day, 'EEE')}
              </span>
              <span
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                  isSel ? 'bg-accent text-white' : day === today ? 'text-accent ring-[1.5px] ring-inset ring-accent' : 'text-ink'
                }`}
              >
                {formatDay(day, 'd')}
              </span>
            </button>
            <div className="flex flex-col gap-1 p-1.5">
              {(byDay.get(day) ?? [])
                .filter((e) => !isLookahead(e))
                .map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    data-testid="cal-line"
                    className="block w-full rounded-[5px] text-left hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => {
                      onOpen(e);
                    }}
                  >
                    <Banner banner={bannerOf(e)} time={timeOf(e)} job={showJob ? e.projectName : undefined} />
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
