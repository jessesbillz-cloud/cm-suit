// The right column while the board fills the main area and nothing is open: today's calendar lines for this job (or
// all my jobs), grouped by time, each with its type icon, title and status, read-only. A click opens the line where
// it lives. Reads the calendar's own data and rules (the types I checked, jobs with the calendar on); "today" is the
// job's.
import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { CalendarLine } from '../../data/calendar.types';
import { useCalendarLines } from '../../data/calendar.queries';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { CALENDAR_KINDS, isCalendarKind, kindLabel, lineTarget } from '../../lib/calendarKinds';
import { detectZone, formatDay, todayInZone } from '../../lib/dates';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { bucketByDay, lineChip, lineTime, rangeFor, visibleLines } from '../calendar/model';
import { useCalendarNav } from '../calendar/useCalendarNav';
import { KindSquare } from './KindSquare';

interface TodayPanelProps {
  /** null = all my jobs. */
  projectId: string | null;
}

interface TodayLineProps {
  line: CalendarLine;
  /** The first line of its time group shows the time; the rest leave the column blank. */
  showTime: boolean;
  showJob: boolean;
  onOpen: (line: CalendarLine) => void;
}

function TodayLine({ line, showTime, showJob, onOpen }: TodayLineProps) {
  const opens = lineTarget(line) !== null;
  const chip = lineChip(line);
  const meta = [showJob ? line.project_name : '', line.location ?? ''].filter((s) => s !== '').join(' · ');
  return (
    <button
      type="button"
      data-testid="cal-line"
      disabled={!opens}
      className={`flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
        opens ? 'hover:bg-page/60' : 'cursor-default'
      }`}
      onClick={() => {
        onOpen(line);
      }}
    >
      <span className="w-14 shrink-0 pt-1.5 text-[12px] font-medium leading-4 tabular-nums text-ink-2">
        {showTime ? lineTime(line) : ''}
      </span>
      <KindSquare
        icon={isCalendarKind(line.kind) ? CALENDAR_KINDS[line.kind].icon : CalendarDays}
        size={28}
        label={kindLabel(line.kind)}
      />
      <span className="min-w-0 flex-1 pt-1">
        <span className="block break-words text-sm leading-5 text-ink">{line.title}</span>
        {meta === '' ? null : <span className="mt-0.5 block text-[12px] leading-4 text-ink-2">{meta}</span>}
      </span>
      {chip ? (
        <span className="shrink-0 pt-1">
          <StatusChip status={chip.status} label={chip.label} />
        </span>
      ) : null}
    </button>
  );
}

/** Consecutive lines that start at the same time ("All day", "8:00 AM") form one group. */
function byTime(lines: readonly CalendarLine[]): { time: string; lines: CalendarLine[] }[] {
  const groups: { time: string; lines: CalendarLine[] }[] = [];
  for (const line of lines) {
    const time = lineTime(line);
    const last = groups[groups.length - 1];
    if (last?.time === time) last.lines.push(line);
    else groups.push({ time, lines: [line] });
  }
  return groups;
}

export function TodayPanel({ projectId }: TodayPanelProps) {
  const projects = useMyProjects();
  const layout = useUserLayout();
  const nav = useCalendarNav(projectId);
  const job = projects.data?.find((p) => p.project_id === projectId);
  // The job's today; on "All my jobs", this device's (the calendar's rule).
  const today = todayInZone(job?.timezone ?? detectZone());
  const days = useMemo(() => [today], [today]);
  const lines = useCalendarLines(projectId, rangeFor(days));

  const types = layout.data?.choices.calendar_types;
  const groups = useMemo(() => {
    const shown = visibleLines(lines.data ?? [], types ?? [], projects.data ?? [], projectId);
    return byTime(bucketByDay(shown, days).get(today) ?? []);
  }, [lines.data, types, projects.data, projectId, days, today]);

  const loading = lines.isPending || layout.isPending || projects.isPending;
  const error = lines.error ?? layout.error ?? projects.error;

  return (
    <section aria-label="Today" data-testid="today-panel" className="flex flex-col">
      <p className="px-4 pb-1 pt-3 text-[12px] font-bold uppercase tracking-wide text-ink">
        {formatDay(today, 'EEEE, MMM d')}
      </p>
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void lines.refetch();
            void layout.refetch();
            void projects.refetch();
          }}
        />
      ) : null}
      {!error && loading ? <LoadingState label="Loading today" /> : null}
      {!error && !loading && groups.length === 0 ? (
        <div data-testid="today-empty">
          <EmptyState icon={TOOL_META.calendar.icon} title="Nothing today." />
        </div>
      ) : null}
      {!error && !loading && groups.length > 0 ? (
        <ol className="flex flex-col px-2 pb-2">
          {groups.map((g) => (
            <li key={g.lines[0]?.id ?? g.time} className="border-t border-line py-1 first:border-t-0">
              <ul className="flex flex-col">
                {g.lines.map((l, i) => (
                  <li key={l.id}>
                    <TodayLine line={l} showTime={i === 0} showJob={projectId === null} onOpen={nav.openLine} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
