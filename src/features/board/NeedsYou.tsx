// "Needs you" (SPEC §7.3): tasks handled in place. Done is one tap, with Undo in the toast (no "are you sure?").
import { Check } from 'lucide-react';
import { useCompleteTask, useUndoTask } from '../../data/mutations';
import { useMyProjects, useTasks } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { TaskRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
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

function TaskLine({ task, projectName, zone, busy, onDone }: TaskLineProps) {
  return (
    <li className="flex items-start gap-3 px-4 py-3" data-testid="needs-you-task">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">{task.title}</p>
        <p className="text-xs text-ink-2">
          {projectName ? <span>{projectName}</span> : null}
          {projectName && task.due_at ? <span> &middot; </span> : null}
          {task.due_at ? <span>Due {formatInZone(task.due_at, zone, 'MMM d')}</span> : null}
        </p>
      </div>
      {task.requires_signature ? (
        <StatusChip status="pending" label="Needs your signature" />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={Check}
          loading={busy}
          onClick={() => {
            onDone(task);
          }}
        >
          Done
        </Button>
      )}
    </li>
  );
}

export function NeedsYou({ projectId }: NeedsYouProps) {
  const tasks = useTasks(projectId);
  const projects = useMyProjects();
  const zoneOf = useProjectZones();
  const complete = useCompleteTask();
  const undo = useUndoTask();
  const toast = useToast();

  function done(task: TaskRow) {
    complete.mutate(task, {
      onSuccess: (version) => {
        toast.show({
          message: `Done: ${task.title}`,
          action: {
            label: 'Undo',
            onClick: () => {
              undo.mutate(
                { id: task.id, version },
                {
                  onError: (e) => {
                    toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
                  },
                },
              );
            },
          },
        });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not marked done: ${messageOf(e)}` });
      },
    });
  }

  const nameOf = (id: string) => (projectId === null ? (projects.data?.find((p) => p.project_id === id)?.name ?? null) : null);

  return (
    <Card title="Needs you" padded={false}>
      {tasks.isPending ? <LoadingState label="Loading your tasks" /> : null}
      {tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} /> : null}
      {tasks.data?.length === 0 ? <EmptyState title="Nothing needs you right now." /> : null}
      {tasks.data && tasks.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {tasks.data.map((t) => (
            <TaskLine
              key={t.id}
              task={t}
              projectName={nameOf(t.project_id)}
              zone={zoneOf(t.project_id)}
              busy={complete.isPending && complete.variables.id === t.id}
              onDone={done}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
