// One calendar line (SPEC §7.6). In week and month cells: a compact chip in its status colors (lib/status), the kind's
// icon and the time over the title (never cut off). As a full-width row (day view, the phone list, the Today panel):
// the time, the kind's icon in a square, the title with its place and job under it, and the status chip.
import type { CalendarLine } from '../../data/calendar.types';
import { CALENDAR_KINDS, isCalendarKind, kindLabel, lineTarget } from '../../lib/calendarKinds';
import { formatInZone } from '../../lib/dates';
import { STATUS } from '../../lib/status';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { lineTime, statusKey } from './model';

interface LineRowProps {
  line: CalendarLine;
  showJob: boolean;
  selected: boolean;
  variant: 'compact' | 'row';
  onOpen: (line: CalendarLine) => void;
}

/** The open row: accent tint and a 3px accent bar on its left edge. */
const SELECTED_ROW = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

function KindIcon({ kind, size }: { kind: string; size: number }) {
  if (!isCalendarKind(kind)) return null;
  return <Icon icon={CALENDAR_KINDS[kind].icon} size={size} label={kindLabel(kind)} className="shrink-0" />;
}

/** A 32px square with the kind's icon; "My due items" (the thing that needs me) gets the accent tint. */
export function KindTile({ kind }: { kind: string }) {
  const tone = kind === 'my_due' ? 'bg-accent-soft text-accent' : 'bg-page text-ink-2';
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <KindIcon kind={kind} size={16} />
    </span>
  );
}

function Compact({ line, showJob, selected, onOpen }: Omit<LineRowProps, 'variant'>) {
  const opens = lineTarget(line) !== null;
  const key = statusKey(line.status);
  // A line with a status wears its colors; one without is a quiet neutral chip.
  const style = key
    ? { background: `var(--status-${key}-bg)`, color: `var(--status-${key}-fg)`, borderColor: `var(--status-${key}-dot)` }
    : undefined;
  return (
    <button
      type="button"
      data-testid="cal-line"
      disabled={!opens}
      title={key ? STATUS[key].label : undefined}
      style={style}
      className={`w-full rounded-md border-l-[3px] px-1.5 py-1 text-left transition-shadow ${key ? '' : 'border-line-strong bg-page text-ink'} ${
        selected ? 'ring-2 ring-accent' : opens ? 'hover:shadow-control hover:brightness-[0.98]' : 'cursor-default'
      }`}
      onClick={() => {
        onOpen(line);
      }}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium leading-4 opacity-80">
        <KindIcon kind={line.kind} size={12} />
        <span className="min-w-0 flex-1 tabular-nums">{lineTime(line)}</span>
      </span>
      <span className="block break-words text-[13px] font-medium leading-snug">{line.title}</span>
      {key ? <span className="sr-only">{STATUS[key].label}</span> : null}
      {showJob ? <span className="block break-words text-[11px] leading-4 opacity-70">{line.project_name}</span> : null}
    </button>
  );
}

export function LineRow({ line, showJob, selected, variant, onOpen }: LineRowProps) {
  if (variant === 'compact') return <Compact line={line} showJob={showJob} selected={selected} onOpen={onOpen} />;

  const opens = lineTarget(line) !== null;
  const key = statusKey(line.status);
  const end = !line.all_day && line.ends_at !== null ? formatInZone(line.ends_at, line.timezone, 'h:mm a') : null;
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
        <span className="font-medium text-ink">{lineTime(line)}</span>
        {end !== null ? <span className="text-xs text-ink-3">{end}</span> : null}
      </span>
      <KindTile kind={line.kind} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-ink">{line.title}</span>
        {meta !== '' ? <span className="block break-words text-xs text-ink-2">{meta}</span> : null}
      </span>
      {key ? <StatusChip status={key} /> : null}
    </button>
  );
}
