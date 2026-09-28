// One calendar line (SPEC §7.6): time or "All day", the type icon, the title (never cut off), the job on "All my
// jobs", and a status dot from lib/status. Compact in week and month cells; a full-width row in the day view and on
// the phone (big target).
import type { CalendarLine } from '../../data/calendar.types';
import { CALENDAR_KINDS, isCalendarKind, kindLabel, lineTarget } from '../../lib/calendarKinds';
import { STATUS } from '../../lib/status';
import { Icon } from '../../ui/Icon';
import { lineTime, statusKey } from './model';

interface LineRowProps {
  line: CalendarLine;
  showJob: boolean;
  selected: boolean;
  variant: 'compact' | 'row';
  onOpen: (line: CalendarLine) => void;
}

function KindIcon({ kind }: { kind: string }) {
  if (!isCalendarKind(kind)) return null;
  return <Icon icon={CALENDAR_KINDS[kind].icon} size={14} label={kindLabel(kind)} className="shrink-0 text-ink-2" />;
}

function StatusDot({ status }: { status: string | null }) {
  const key = statusKey(status);
  if (key === null) return null;
  return (
    <span
      role="img"
      aria-label={STATUS[key].label}
      title={STATUS[key].label}
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: `var(--status-${key}-dot)` }}
    />
  );
}

export function LineRow({ line, showJob, selected, variant, onOpen }: LineRowProps) {
  const opens = lineTarget(line) !== null;
  const base = `w-full rounded-md text-left ${selected ? 'bg-accent-soft' : opens ? 'hover:bg-page' : ''} ${opens ? '' : 'cursor-default'}`;
  const time = lineTime(line);
  const job = showJob ? <span className="block text-xs text-ink-3">{line.project_name}</span> : null;

  if (variant === 'compact') {
    return (
      <button type="button" data-testid="cal-line" disabled={!opens} className={`${base} px-1.5 py-1`} onClick={() => { onOpen(line); }}>
        <span className="flex items-center gap-1 text-xs text-ink-2">
          <KindIcon kind={line.kind} />
          <span className="min-w-0 flex-1">{time}</span>
          <StatusDot status={line.status} />
        </span>
        <span className="block break-words text-sm leading-snug text-ink">{line.title}</span>
        {job}
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="cal-line"
      disabled={!opens}
      className={`${base} flex min-h-12 items-start gap-3 px-3 py-2.5`}
      onClick={() => {
        onOpen(line);
      }}
    >
      <span className="w-16 shrink-0 pt-0.5 text-xs text-ink-2">{time}</span>
      <span className="pt-0.5">
        <KindIcon kind={line.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm text-ink">{line.title}</span>
        {job}
      </span>
      <span className="pt-1.5">
        <StatusDot status={line.status} />
      </span>
    </button>
  );
}
