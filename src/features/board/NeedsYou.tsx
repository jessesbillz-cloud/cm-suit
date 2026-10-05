// "Needs you" (SPEC §7.3): tasks handled in place (TaskEnd: Open for a task its record closes, Acknowledge for an
// addendum, Done with Undo for the rest). On top, the RFIs someone else is sitting on (late, or not opened for days).
// One row design for both (NeedsRow).
import { CheckCheck, ListTodo } from 'lucide-react';
import { useMyProjects } from '../../data/queries';
import type { TaskRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { KindSquare } from './KindSquare';
import { kindIcon } from './lineKind';
import { NeedsRow } from './NeedsRow';
import { RfiWaitingLine } from './RfiWaiting';
import { TaskEnd } from './TaskEnd';
import { useNeedsYou } from './useNeedsYou';
import { useTaskDone } from './useTaskDone';
import { useProjectZones } from './zones';

interface NeedsYouProps {
  projectId: string | null;
}

interface TaskLineProps {
  task: TaskRow;
  projectName: string | null;
  zone: string;
  busy: boolean;
  onDone: (task: TaskRow) => void;
}

/** Phone: a full-size tap target under the text. */
const PHONE_TAP = 'max-sm:h-11 max-sm:px-4';

function TaskLine({ task, projectName, zone, busy, onDone }: TaskLineProps) {
  const due = task.due_at ? `Due ${formatInZone(task.due_at, zone, 'MMM d')}` : '';
  return (
    <NeedsRow
      testId="needs-you-task"
      icon={kindIcon(task.entity_type, task.entity_id, task.kind, ListTodo)}
      title={task.title}
      meta={[projectName ?? '', due].filter((s) => s !== '').join(' · ')}
      end={<TaskEnd task={task} busy={busy} onDone={onDone} className={PHONE_TAP} />}
    />
  );
}

export function NeedsYou({ projectId }: NeedsYouProps) {
  const { tasks, waiting, rfis, count, ready } = useNeedsYou(projectId);
  const projects = useMyProjects();
  const zoneOf = useProjectZones();
  const { done, busyId } = useTaskDone();

  const nameOf = (id: string) => (projectId === null ? (projects.data?.find((p) => p.project_id === id)?.name ?? null) : null);
  // RFIs someone else is sitting on come first (late, then not opened), then my tasks, due first.
  const now = new Date();
  const loading = tasks.isPending || waiting.isPending;

  return (
    <Card title="Needs you" padded={false}>
      {loading ? <LoadingState label="Loading your tasks" /> : null}
      {tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} /> : null}
      {waiting.isError ? <ErrorState error={waiting.error} onRetry={() => void waiting.refetch()} title="Waiting RFIs did not load." /> : null}
      {ready && count === 0 ? (
        <p className="flex items-center gap-3 px-4 py-3 text-sm text-ink-2">
          <KindSquare icon={CheckCheck} />
          Nothing needs you right now.
        </p>
      ) : null}
      {!loading && count > 0 ? (
        <ul className="divide-y divide-line">
          {rfis.map((w) => (
            <RfiWaitingLine key={w.id} row={w} showJob={projectId === null} zone={zoneOf(w.project_id)} now={now} />
          ))}
          {(tasks.data ?? []).map((t) => (
            <TaskLine
              key={t.id}
              task={t}
              projectName={nameOf(t.project_id)}
              zone={zoneOf(t.project_id)}
              busy={busyId === t.id}
              onDone={done}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
