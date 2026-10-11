// The one month calendar (the Calendar tool and Inspections; Jesse Oct 10, MDR's pattern): the whole month fits on the
// screen, each day only its date and a few small dots in its items' status colors (lib/status), never their words. A
// tap on a day opens its items right under that day's week (the weeks after it move down); a tap on the open day, or
// on another, closes or switches it. Only the open day's row holds anything; the page decides what (children).
// Days of other months stay blank, as in MDR. Today's date is ringed; the open day is tinted with its date filled.
import type { ReactNode } from 'react';
import { formatDay } from '../lib/dates';
import { isWeekendDay, monthDays, rowsWithOpen, weekRows } from '../lib/monthGrid';
import type { StatusKey } from '../lib/status';

/** One item on a day: its status color, or null (an item with no state: a hollow dot). */
export interface DayMark {
  key: string;
  tone: StatusKey | null;
}

/** Up to four dots; past that, three and "+N". */
const DOTS = 4;

interface MonthCalendarProps {
  /** Any day of the month shown. */
  anchor: string;
  today: string;
  /** The open (picked) day, or null. */
  open: string | null;
  marks: ReadonlyMap<string, readonly DayMark[]>;
  /** Test ids: `<prefix>-month`, `<prefix>-day-<day>`, `<prefix>-mark`, `<prefix>-open`. */
  testIdPrefix: string;
  onPick: (day: string) => void;
  /** The open day's items, under its week. Nothing (null) adds no row: the day is only picked. */
  children?: ReactNode;
}

function Dots({ marks, testIdPrefix }: { marks: readonly DayMark[]; testIdPrefix: string }) {
  const shown = marks.length > DOTS ? marks.slice(0, DOTS - 1) : marks;
  const more = marks.length - shown.length;
  return (
    <span className="flex h-2 items-center justify-center gap-[3px]">
      {shown.map((m) => (
        <span
          key={m.key}
          data-testid={`${testIdPrefix}-mark`}
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.tone ? '' : 'ring-1 ring-inset ring-ink-3'}`}
          style={m.tone ? { background: `var(--status-${m.tone}-dot)` } : undefined}
        />
      ))}
      {more > 0 ? <span className="text-[10px] font-medium leading-none text-ink-3">+{more}</span> : null}
    </span>
  );
}

interface CellProps {
  day: string;
  marks: readonly DayMark[];
  today: string;
  open: boolean;
  testIdPrefix: string;
  onPick: (day: string) => void;
}

function Cell({ day, marks, today, open, testIdPrefix, onPick }: CellProps) {
  const tint = open ? 'bg-accent-soft' : isWeekendDay(day) ? 'bg-card-head hover:bg-page/70' : 'bg-card hover:bg-page/50';
  const date = open
    ? 'bg-accent font-semibold text-white'
    : day === today
      ? 'font-semibold text-accent ring-[1.5px] ring-inset ring-accent'
      : isWeekendDay(day)
        ? 'text-ink-3'
        : 'text-ink';
  const count = marks.length;
  return (
    <button
      type="button"
      data-testid={`${testIdPrefix}-day-${day}`}
      aria-pressed={open}
      aria-label={`${formatDay(day, 'EEEE, MMMM d')}${count > 0 ? `, ${String(count)} on the calendar` : ''}`}
      className={`flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 transition-colors focus-visible:relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:h-14 sm:gap-1 ${tint}`}
      onClick={() => {
        onPick(day);
      }}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums sm:text-sm ${date}`}>
        {formatDay(day, 'd')}
      </span>
      <Dots marks={marks} testIdPrefix={testIdPrefix} />
    </button>
  );
}

const NONE: readonly DayMark[] = [];

export function MonthCalendar({ anchor, today, open, marks, testIdPrefix, onPick, children }: MonthCalendarProps) {
  const month = anchor.slice(0, 7);
  const weeks = weekRows(monthDays(anchor));
  const hasRow = children !== null && children !== undefined && children !== false;
  const rows = rowsWithOpen(weeks, hasRow ? open : null);
  return (
    <div data-testid={`${testIdPrefix}-month`}>
      <div className="grid grid-cols-7 border-b border-line bg-card-head">
        {(weeks[0] ?? []).map((day) => (
          <span
            key={day}
            className={`py-1 text-center text-[11px] font-medium uppercase tracking-wide sm:py-1.5 sm:text-[12px] ${isWeekendDay(day) ? 'text-ink-3' : 'text-ink-2'}`}
          >
            <span className="sm:hidden">{formatDay(day, 'EEEEE')}</span>
            <span className="hidden sm:inline">{formatDay(day, 'EEE')}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-line">
        {rows.map((row) =>
          row.type === 'open' ? (
            <div key={`open-${row.day}`} data-testid={`${testIdPrefix}-open`} className="bg-page/40">
              {children}
            </div>
          ) : (
            // 1px gaps over a line-colored background draw the grid.
            <div key={row.days[0]} className="grid grid-cols-7 gap-px bg-line">
              {row.days.map((day) =>
                day.startsWith(month) ? (
                  <Cell
                    key={day}
                    day={day}
                    marks={marks.get(day) ?? NONE}
                    today={today}
                    open={day === open}
                    testIdPrefix={testIdPrefix}
                    onPick={onPick}
                  />
                ) : (
                  <span key={day} aria-hidden className="bg-page/60" />
                ),
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
