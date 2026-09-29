// The calendar's data for the days on screen: the lines the person shows (their types; on "All my jobs" the jobs with
// the calendar on) and every such job's inspections (live), merged into job-local days.
import { useMemo } from 'react';
import { useCalendarInspections, useCalendarLines } from '../../data/calendar.queries';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { buildEntries, entriesByDay } from './entries';
import { inspectionJobs, rangeFor, visibleLines } from './model';

export function useCalendarData(projectId: string | null, days: readonly string[]) {
  const projects = useMyProjects();
  const layout = useUserLayout();
  const lines = useCalendarLines(projectId, rangeFor(days));
  const irJobs = useMemo(() => inspectionJobs(projects.data ?? [], projectId), [projects.data, projectId]);
  const inspections = useCalendarInspections(irJobs, days[0] ?? '', days[days.length - 1] ?? '');
  const types = layout.data?.choices.calendar_types;

  const byDay = useMemo(() => {
    const jobs = projects.data ?? [];
    const entries = buildEntries({
      lines: visibleLines(lines.data ?? [], types ?? [], jobs, projectId),
      inspections: inspections.rows,
      loaded: inspections.loaded,
      types: types ?? [],
      jobs,
    });
    return entriesByDay(entries, days);
  }, [lines.data, inspections.rows, inspections.loaded, types, projects.data, projectId, days]);

  return { projects, layout, lines, inspections, irJobs, types, byDay };
}
