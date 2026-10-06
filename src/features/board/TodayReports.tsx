// Today's reports (SPEC §13.1, My Daily Reports' home): at the top of All my jobs, one card per job where I write
// dailies, each one tap from today's report there; 2-3 to a row on a desktop, one on a phone. Only for someone with a
// daily setup: until the answer is in, and for everyone else, nothing shows. An error is loud.
import { useId } from 'react';
import { useDailyToday } from '../../data/dailyToday.queries';
import type { DailyTodayRow } from '../../data/dailyToday.types';
import { useMyProjects } from '../../data/queries';
import { formatDay } from '../../lib/dates';
import { toolIsOn } from '../../lib/jobs';
import { Card } from '../../ui/Card';
import { ErrorState } from '../../ui/States';
import { TodayReportCard } from './TodayReportCard';

/** "Mon, Sep 28" when every job is on the same day (jobs in far-apart zones can be on different days). */
function sharedDay(rows: readonly DailyTodayRow[]): string | null {
  const days = new Set(rows.map((r) => r.today));
  const [day] = days;
  return days.size === 1 && day !== undefined ? formatDay(day, 'EEE, MMM d') : null;
}

export function TodayReports() {
  const today = useDailyToday();
  const projects = useMyProjects();
  const titleId = useId();
  /** The calendar button only where the job's Calendar is on (never a dead end). */
  const calendarOn = (projectId: string) =>
    toolIsOn('calendar', projects.data?.find((p) => p.project_id === projectId)?.modules ?? []);

  if (today.isError) {
    return (
      <Card padded={false}>
        <ErrorState error={today.error} title="Today's reports did not load." onRetry={() => void today.refetch()} />
      </Card>
    );
  }
  const rows = today.data ?? [];
  if (rows.length === 0) return null;
  const day = sharedDay(rows);

  return (
    <section aria-labelledby={titleId} data-testid="today-reports" className="flex flex-col gap-2">
      <h2 id={titleId} className="px-1 text-[12px] font-bold uppercase tracking-wide text-ink">
        Today&apos;s reports{day === null ? '' : ` · ${day}`}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {rows.map((row) => (
          <TodayReportCard key={row.project_id} row={row} calendar={calendarOn(row.project_id)} />
        ))}
      </div>
    </section>
  );
}
