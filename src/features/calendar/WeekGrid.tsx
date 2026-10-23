// The week: seven columns, Monday first, the whole main area wide. Each entry is a box (WeekEvent): the time on the
// left, the title in the display face, who or where under it, a bar in its status color. Today's heading is filled in
// the accent; the selected day is tinted with a dark line under its heading. An empty day stays quiet.
// A request opens in the right column; a line opens where it lives; a column's date shows that day below.
import { formatDay } from '../../lib/dates';
import { isLookahead, type Entry } from './entries';
import { isWeekendDay } from './model';
import { WeekEvent } from './WeekEvent';

interface WeekGridProps {
  days: readonly string[];
  byDay: Map<string, Entry[]>;
  today: string;
  selected: string;
  showJob: boolean;
  onSelect: (day: string) => void;
  onOpen: (entry: Entry) => void;
}

function headClass(isToday: boolean, isSel: boolean): string {
  const fill = isToday ? 'bg-accent text-white hover:bg-accent-hover' : 'text-ink hover:bg-page/60';
  const mark = isSel ? 'shadow-[inset_0_-3px_0_theme(colors.ink.DEFAULT)]' : '';
  return `flex flex-col items-center justify-center border-b border-line py-2 ${fill} ${mark}`;
}

export function WeekGrid({ days, byDay, today, selected, showJob, onSelect, onOpen }: WeekGridProps) {
  return (
    <div className="grid w-full grid-cols-7 divide-x divide-line">
      {days.map((day) => {
        const isSel = day === selected;
        const isToday = day === today;
        const entries = (byDay.get(day) ?? []).filter((e) => !isLookahead(e));
        const tint = isSel ? 'bg-accent-soft/40' : isWeekendDay(day) ? 'bg-card-head' : '';
        return (
          <div key={day} data-testid={`cal-day-${day}`} className={`flex min-h-[26rem] min-w-0 flex-col ${tint}`}>
            <button
              type="button"
              aria-pressed={isSel}
              className={headClass(isToday, isSel)}
              onClick={() => {
                onSelect(day);
              }}
            >
              <span className={`heading text-[12px] font-medium leading-4 ${isToday ? 'text-white' : 'text-ink-2'}`}>
                {isToday ? 'Today' : formatDay(day, 'EEE')}
              </span>
              <span className="heading text-[22px] font-semibold leading-7 tabular-nums">{formatDay(day, 'd')}</span>
            </button>
            {entries.length > 0 ? (
              <div className="flex flex-col gap-1.5 p-1.5">
                {entries.map((e) => (
                  <WeekEvent key={e.key} entry={e} showJob={showJob} onOpen={onOpen} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
