// The month (MDR's schedule calendar): whole weeks, Monday first. Each day of the month shows up to three banners
// (the inspection type or the line, in its status colors) and "+N"; tapping a day shows it below the grid. Today's
// date is ringed; the selected day is tinted with its date filled. Days of other months stay blank, as in MDR.
import { formatDay } from '../../lib/dates';
import { Banner, BannerBar } from './Banner';
import { bannerOf, isLookahead, type Entry } from './entries';
import { isWeekendDay } from './model';

const SHOWN = 3;

interface MonthGridProps {
  days: readonly string[];
  /** yyyy-MM: days outside it are blank. */
  month: string;
  byDay: Map<string, Entry[]>;
  today: string;
  selected: string;
  isPhone: boolean;
  onSelect: (day: string) => void;
}

function DateMark({ day, today, selected }: { day: string; today: string; selected: boolean }) {
  const tone = selected
    ? 'bg-accent font-semibold text-white'
    : day === today
      ? 'font-semibold text-accent ring-[1.5px] ring-inset ring-accent'
      : isWeekendDay(day)
        ? 'text-ink-3'
        : 'text-ink';
  return (
    <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums sm:text-sm ${tone}`}>
      {formatDay(day, 'd')}
    </span>
  );
}

interface CellProps {
  day: string;
  entries: readonly Entry[];
  today: string;
  selected: boolean;
  isPhone: boolean;
  onSelect: (day: string) => void;
}

function Cell({ day, entries, today, selected, isPhone, onSelect }: CellProps) {
  const shown = entries.slice(0, SHOWN);
  const more = entries.length - shown.length;
  const tint = selected ? 'bg-accent-soft' : isWeekendDay(day) ? 'bg-card-head hover:bg-page/70' : 'bg-card hover:bg-page/50';
  return (
    <button
      type="button"
      data-testid={`cal-day-${day}`}
      aria-pressed={selected}
      aria-label={`${formatDay(day, 'EEEE, MMMM d')}${entries.length > 0 ? `, ${String(entries.length)} on the calendar` : ''}`}
      className={`flex min-h-[64px] min-w-0 flex-col gap-1 px-1 pb-1.5 pt-1.5 text-left transition-colors focus-visible:relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:min-h-[118px] sm:gap-[3px] sm:px-1.5 ${tint} ${
        selected ? 'shadow-[inset_0_-2px_0_theme(colors.accent.DEFAULT)]' : ''
      }`}
      onClick={() => {
        onSelect(day);
      }}
    >
      <DateMark day={day} today={today} selected={selected} />
      {shown.map((e) =>
        isPhone ? <BannerBar key={e.key} banner={bannerOf(e)} /> : <Banner key={e.key} banner={bannerOf(e)} />,
      )}
      {more > 0 ? (
        <span className="text-center text-[10px] font-medium leading-3 text-ink-3 sm:text-[11px] sm:leading-4">+{more}</span>
      ) : null}
    </button>
  );
}

export function MonthGrid({ days, month, byDay, today, selected, isPhone, onSelect }: MonthGridProps) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line bg-card-head">
        {days.slice(0, 7).map((day) => (
          <span
            key={day}
            className={`py-2 text-center text-[11px] font-medium uppercase tracking-wide sm:text-[12px] ${isWeekendDay(day) ? 'text-ink-3' : 'text-ink-2'}`}
          >
            {formatDay(day, isPhone ? 'EEEEE' : 'EEE')}
          </span>
        ))}
      </div>
      {/* 1px gaps over a line-colored background draw the grid. */}
      <div className="grid grid-cols-7 gap-px bg-line">
        {days.map((day) =>
          day.startsWith(month) ? (
            <Cell
              key={day}
              day={day}
              entries={(byDay.get(day) ?? []).filter((e) => !isLookahead(e))}
              today={today}
              selected={day === selected}
              isPhone={isPhone}
              onSelect={onSelect}
            />
          ) : (
            <span key={day} aria-hidden className="bg-page/60" />
          ),
        )}
      </div>
    </div>
  );
}
