// Block time from the calendar (MDR's "+ Block time"): inspections' own form, for the selected day. On "All my jobs"
// the job is picked first, among the jobs where I decide inspections. Saved, it closes back to the calendar.
import { useMemo, useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { useJobsWithCapability, useMyProjects } from '../../data/queries';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { BlockForm } from '../inspections/BlockForm';
import { ChoiceRow } from '../inspections/ChoiceRow';
import { inspectionJobs } from './model';
import type { CalendarNav } from './useCalendarNav';

interface BlockPanelProps {
  projectId: string | null;
  nav: CalendarNav;
}

export function BlockPanel({ projectId, nav }: BlockPanelProps) {
  const projects = useMyProjects();
  const ids = useMemo(() => inspectionJobs(projects.data ?? [], projectId), [projects.data, projectId]);
  const deciders = useJobsWithCapability(ids, 'ir.decide');
  const [picked, setPicked] = useState<string | null>(null);

  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;
  if (deciders.error) return <ErrorState error={deciders.error} onRetry={deciders.refetch} />;
  if (projects.isPending || deciders.ids === undefined) return <LoadingState label="Loading" />;
  const jobs = deciders.ids;
  const job = picked !== null && jobs.includes(picked) ? picked : jobs[0];
  if (job === undefined) return <EmptyState icon={CalendarOff} title="Only inspectors block time." />;
  const name = (id: string) => projects.data.find((p) => p.project_id === id)?.name ?? '';

  return (
    <div data-testid="cal-block-panel">
      {jobs.length > 1 ? (
        <div className="px-4 pt-4">
          <ChoiceRow label="Job" options={jobs.map((id) => ({ value: id, label: name(id) }))} value={job} onPick={setPicked} testId="cal-block-job" />
        </div>
      ) : null}
      <BlockForm
        key={job}
        projectId={job}
        onDone={() => {
          nav.closeTo(null);
        }}
      />
    </div>
  );
}
