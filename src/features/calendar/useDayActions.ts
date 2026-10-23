// What the day offers me: Add (calendar.manage on the job, or on some job with the calendar on for "All my jobs") and
// Block time (ir.decide on some job whose inspections show). Read by the day under the month (phone) and the day in
// the right column (desktop).
import { useMemo } from 'react';
import { useCapability, useJobsWithCapability, useMyProjects } from '../../data/queries';
import { toolIsOn } from '../../lib/jobs';

export function useDayActions(projectId: string | null, irJobs: readonly string[]): { canAdd: boolean; canBlock: boolean } {
  const projects = useMyProjects();
  const manage = useCapability(projectId, 'calendar.manage');
  const calendarJobs = useMemo(
    () => (projectId === null ? (projects.data ?? []).filter((p) => toolIsOn('calendar', p.modules)).map((p) => p.project_id) : []),
    [projects.data, projectId],
  );
  const managers = useJobsWithCapability(calendarJobs, 'calendar.manage');
  const deciders = useJobsWithCapability(irJobs, 'ir.decide');
  return {
    canAdd: projectId === null ? (managers.ids ?? []).length > 0 : manage.data === true,
    canBlock: (deciders.ids ?? []).length > 0,
  };
}
