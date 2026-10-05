// What a task offers, in "Needs you" and on an opened board item alike (SPEC §5.5). A task its record closes (an RFI
// moving on, a correction re-inspected, a tailgate meeting held, a requirement scheduled or done) has Open, which goes
// to the record: Done there would only hide the reminder. An addendum is acknowledged in place, one tap, which records
// the acknowledgment and closes the task. A task that needs a signature says so. Only a task with no record behind it
// (a failed background job, a blocked file, an inbound email, a plain to-do) gets Done.
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import { useAcknowledgeAddendum } from '../../data/bidder';
import { messageOf } from '../../data/errors';
import { qk } from '../../data/keys';
import type { TaskRow } from '../../data/types';
import { entityTarget } from '../../lib/entityTarget';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';

/** Task kinds (create_task's p_kind in the migrations) that the record closes by itself when it moves on. */
const CLOSED_BY_RECORD = new Set(['rfi', 'correction.reinspect', 'safety.tailgate_due', 'requirements.due']);
/** The task kind acknowledged in place (bids 0011: acknowledge_addendum closes it). */
const ADDENDUM_ACK = 'addendum_ack';

interface TaskEndProps {
  task: TaskRow;
  busy: boolean;
  onDone: (task: TaskRow) => void;
  className?: string | undefined;
}

function AcknowledgeButton({ task, className }: { task: TaskRow; className?: string | undefined }) {
  const ack = useAcknowledgeAddendum();
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={Check}
      loading={ack.isPending}
      className={className}
      onClick={() => {
        if (task.entity_id === null) return;
        ack.mutate(
          { projectId: task.project_id, addendumId: task.entity_id },
          {
            // The database closed the task with the acknowledgment: every task list (and the rail's counts) refreshes.
            onSuccess: () => {
              void qc.invalidateQueries({ queryKey: qk.tasksAll });
            },
            onError: (e) => {
              toast.show({ tone: 'error', message: `Not acknowledged: ${messageOf(e)}` });
            },
          },
        );
      }}
    >
      Acknowledge
    </Button>
  );
}

export function TaskEnd({ task, busy, onDone, className }: TaskEndProps) {
  const openTarget = useOpenTarget();
  if (task.kind === ADDENDUM_ACK && task.entity_id !== null) return <AcknowledgeButton task={task} className={className} />;
  const target = CLOSED_BY_RECORD.has(task.kind) ? entityTarget(task.entity_type, task.entity_id) : null;
  if (target) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={ArrowRight}
        className={className}
        onClick={() => {
          openTarget(task.project_id, target);
        }}
      >
        Open
      </Button>
    );
  }
  if (task.requires_signature) return <StatusChip status="pending" label="Needs your signature" />;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={Check}
      loading={busy}
      className={className}
      onClick={() => {
        onDone(task);
      }}
    >
      Done
    </Button>
  );
}
