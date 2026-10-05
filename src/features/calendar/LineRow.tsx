// One calendar line as a full-width row (the day under the calendar, its look-ahead): the time, the kind's icon in a
// square, the title with its place and job under it, and the status chip (lib/status; model lineChip). Titles wrap,
// never cut off.
import type { CalendarLine } from '../../data/calendar.types';
import { CALENDAR_KINDS, isCalendarKind, kindLabel, lineTarget } from '../../lib/calendarKinds';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { lineChip, lineTime } from './model';

interface LineRowProps {
  line: CalendarLine;
  showJob: boolean;
  selected: boolean;
  /** The left column instead of the time (the look-ahead shows the weekday). */
  timeLabel?: string | undefined;
  onOpen: (line: CalendarLine) => void;
}

/** The open row: accent tint and a 3px accent bar on its left edge. */
const SELECTED_ROW = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

/** A 32px square with the kind's icon; "My due items" (the thing that needs me) gets the accent tint. */
export function KindTile({ kind }: { kind: string }) {
  const tone = kind === 'my_due' ? 'bg-accent-soft text-accent' : 'bg-page text-ink-2';
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      {isCalendarKind(kind) ? <Icon icon={CALENDAR_KINDS[kind].icon} size={16} label={kindLabel(kind)} className="shrink-0" /> : null}
    </span>
  );
}

export function LineRow({ line, showJob, selected, timeLabel, onOpen }: LineRowProps) {
  const opens = lineTarget(line) !== null;
  const chip = lineChip(line);
  const end = timeLabel === undefined && !line.all_day && line.ends_at !== null ? formatInZone(line.ends_at, line.timezone, 'h:mm a') : null;
  const meta = [line.location, showJob ? line.project_name : null].filter((v): v is string => v !== null && v !== '').join(' · ');
  return (
    <button
      type="button"
      data-testid="cal-line"
      disabled={!opens}
      className={`flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left ${
        selected ? SELECTED_ROW : opens ? 'hover:bg-page/60' : 'cursor-default'
      }`}
      onClick={() => {
        onOpen(line);
      }}
    >
      <span className="flex w-[4.25rem] shrink-0 flex-col text-[13px] leading-5 tabular-nums">
        <span className="font-medium text-ink">{timeLabel ?? lineTime(line)}</span>
        {end !== null ? <span className="text-xs text-ink-3">{end}</span> : null}
      </span>
      <KindTile kind={line.kind} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-ink">{line.title}</span>
        {meta !== '' ? <span className="block break-words text-xs text-ink-2">{meta}</span> : null}
      </span>
      {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
    </button>
  );
}
