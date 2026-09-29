// Add a manual line (calendar.manage). Prefilled with the day that was clicked and the current job; on "All my jobs"
// the job is picked here (starting on the most recent) and checked with has_capability.
import { useState } from 'react';
import { useAddCalendarLine } from '../../data/calendar.mutations';
import { messageOf } from '../../data/errors';
import { useSaveLayout } from '../../data/mutations';
import { useCapability, useMyProjects, useUserLayout } from '../../data/queries';
import type { MyProject } from '../../data/types';
import { MANUAL_KINDS } from '../../lib/calendarKinds';
import { todayInZone } from '../../lib/dates';
import { toolIsOn } from '../../lib/jobs';
import { CALENDAR_TYPES } from '../../lib/layout';
import { SelectField } from '../../ui/Fields';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { fieldsOf, newDraft, type LineDraft } from './draft';
import { LineForm } from './LineForm';
import { lineDay } from './model';
import type { CalendarNav } from './useCalendarNav';

interface AddLineProps {
  projectId: string | null;
  nav: CalendarNav;
}

interface AddFormProps {
  jobs: readonly MyProject[];
  initialJobId: string;
  showJobField: boolean;
  types: readonly string[];
  nav: CalendarNav;
}

function AddForm({ jobs, initialJobId, showJobField, types, nav }: AddFormProps) {
  const [jobId, setJobId] = useState(initialJobId);
  const tz = jobs.find((j) => j.project_id === jobId)?.timezone ?? 'UTC';
  // The first hand-added type the person shows; the form never starts on a hidden type.
  const [draft, setDraft] = useState<LineDraft>(() =>
    newDraft(nav.day ?? todayInZone(tz), MANUAL_KINDS.find((k) => types.includes(k)) ?? MANUAL_KINDS[0]),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const manage = useCapability(jobId, 'calendar.manage');
  const add = useAddCalendarLine();
  const saveLayout = useSaveLayout();
  const allowed = manage.data === true;

  function submit() {
    const fields = fieldsOf(draft, tz);
    if ('problem' in fields) {
      setProblem(fields.problem);
      return;
    }
    setProblem(null);
    add.mutate(
      { projectId: jobId, fields },
      {
        onSuccess: (line) => {
          // A line of a type the person hides would vanish: show that type from now on.
          if (!types.includes(line.kind)) saveLayout.mutate({ calendar_types: CALENDAR_TYPES.filter((k) => k === line.kind || types.includes(k)) });
          nav.closeTo(lineDay(line));
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  const jobField = showJobField ? (
    <SelectField
      label="Job"
      value={jobId}
      options={jobs.map((j) => ({ value: j.project_id, label: j.name }))}
      testId="cal-job"
      onChange={setJobId}
    />
  ) : null;

  return (
    <LineForm
      draft={draft}
      onChange={setDraft}
      jobField={jobField}
      problem={problem ?? (manage.isSuccess && !allowed ? 'You can’t add lines on this job.' : null)}
      saving={add.isPending}
      canSave={allowed}
      submitLabel="Add"
      onSubmit={submit}
      autoFocusTitle
    />
  );
}

export function AddLine({ projectId, nav }: AddLineProps) {
  const projects = useMyProjects();
  const layout = useUserLayout();
  if (projects.isPending || layout.isPending) return <LoadingState label="Loading" />;
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;

  const { recent_project_ids: recent, calendar_types: types } = layout.data.choices;
  // One job: that job. All my jobs: the ones with the calendar on, starting on the most recent.
  const jobs = projectId !== null ? projects.data : projects.data.filter((p) => toolIsOn('calendar', p.modules));
  const initial = projectId ?? recent.find((id) => jobs.some((j) => j.project_id === id)) ?? jobs[0]?.project_id;
  if (initial === undefined) return <EmptyState title="No job has the calendar on." icon={TOOL_META.calendar.icon} />;
  return <AddForm jobs={jobs} initialJobId={initial} showJobField={projectId === null} types={types} nav={nav} />;
}
