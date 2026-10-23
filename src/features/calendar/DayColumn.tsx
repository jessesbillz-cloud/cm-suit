// The selected day in the right column (desktop; Jesse, Oct 23: "it should shrink and show the little screen on the
// right"): the same day list as under the month on a phone, for the URL's ?day= (today without one). A request or a
// line opens in this column in its place; Back to the day returns here.
import { useMemo } from 'react';
import { useMyProjects } from '../../data/queries';
import { detectZone, todayInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { DayDetail } from './DayDetail';
import { isLookahead, type LineEntry } from './entries';
import { visibleDays } from './model';
import { useCalendarData } from './useCalendarData';
import type { CalendarNav } from './useCalendarNav';
import { useDayActions } from './useDayActions';

interface DayColumnProps {
  projectId: string | null;
  nav: CalendarNav;
}

export function DayColumn({ projectId, nav }: DayColumnProps) {
  const projects = useMyProjects();
  const job = projects.data?.find((p) => p.project_id === projectId);
  const today = todayInZone(job?.timezone ?? detectZone());
  const day = nav.day ?? today;
  const week = useMemo(() => visibleDays('week', day), [day]);
  const data = useCalendarData(projectId, week);
  const actions = useDayActions(projectId, data.irJobs);

  const failed = data.layout.isError ? data.layout : data.projects.isError ? data.projects : data.lines.isError ? data.lines : null;
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (data.inspections.error) return <ErrorState error={data.inspections.error} onRetry={data.inspections.refetch} />;
  if (data.layout.isPending || data.projects.isPending || data.lines.isPending || data.inspections.isPending) {
    return <LoadingState label="Loading the day" />;
  }
  const lookahead = week.flatMap((d) => data.byDay.get(d) ?? []).filter((e): e is LineEntry => isLookahead(e));
  return (
    <DayDetail
      bare
      day={day}
      today={today}
      entries={data.byDay.get(day) ?? []}
      week={week}
      lookahead={lookahead}
      showJob={projectId === null}
      openId={null}
      isPhone={false}
      onAdd={
        actions.canAdd
          ? () => {
              nav.add(day);
            }
          : null
      }
      onBlock={actions.canBlock ? nav.block : null}
      onOpenRequest={(e) => {
        if (e.row.id !== null) nav.openRequest(e.projectId, e.row.id);
      }}
      onOpenLine={nav.openLine}
    />
  );
}
