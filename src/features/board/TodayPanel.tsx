// The right column while the board fills the main area and nothing is open: today's calendar lines for this job (or
// all my jobs), one line each with time, type icon and title, read-only. A click opens the line where it lives.
// Reads the calendar's own data and rules (the types I checked, jobs with the calendar on); "today" is the job's.
import { useMemo } from 'react';
import { useCalendarLines } from '../../data/calendar.queries';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { detectZone, formatDay, todayInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { LineRow } from '../calendar/LineRow';
import { bucketByDay, rangeFor, visibleLines } from '../calendar/model';
import { useCalendarNav } from '../calendar/useCalendarNav';

interface TodayPanelProps {
  /** null = all my jobs. */
  projectId: string | null;
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
  const todays = useMemo(() => {
    const shown = visibleLines(lines.data ?? [], types ?? [], projects.data ?? [], projectId);
    return bucketByDay(shown, days).get(today) ?? [];
  }, [lines.data, types, projects.data, projectId, days, today]);

  const loading = lines.isPending || layout.isPending || projects.isPending;
  const error = lines.error ?? layout.error ?? projects.error;

  return (
    <section aria-label="Today" data-testid="today-panel" className="flex flex-col">
      <p className="border-b border-line px-4 py-2 text-sm font-medium text-ink-2">{formatDay(today, 'EEEE, MMM d')}</p>
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
      {!error && !loading && todays.length === 0 ? (
        <p data-testid="today-empty" className="px-4 py-6 text-sm text-ink-2">
          Nothing today.
        </p>
      ) : null}
      {!error && !loading && todays.length > 0 ? (
        <ul className="flex flex-col gap-0.5 p-2">
          {todays.map((l) => (
            <li key={l.id}>
              <LineRow line={l} showJob={projectId === null} selected={false} variant="row" onOpen={nav.openLine} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
