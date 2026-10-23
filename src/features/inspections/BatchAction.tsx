// The one tap for a whole batch (0114): the step I take on its requests that wait on me, in the single buttons' own
// words ("Ready all (9)", "Send all to OFS (9)"). The database runs each request's own step, all or nothing.
import { Send, SquareCheck } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useIrBatchStep, waitingOf, type BatchStep, type IrBatch } from '../../data/inspections.batch';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

function batchStepLabel(step: BatchStep, n: number): string {
  return `${step === 'send' ? 'Send all to OFS' : 'Ready all'} (${String(n)})`;
}

export function BatchAction({ batch, className = '' }: { batch: IrBatch; className?: string | undefined }) {
  const run = useIrBatchStep();
  const toast = useToast();
  if (batch.step === null) return null;
  const n = waitingOf(batch).length;
  return (
    <Button
      variant="primary"
      size="sm"
      icon={batch.step === 'send' ? Send : SquareCheck}
      loading={run.isPending}
      className={className}
      data-testid="batch-step"
      data-step={batch.step}
      onClick={() => {
        run.mutate(batch, {
          onError: (e) => {
            toast.show({ tone: 'error', message: messageOf(e) });
          },
        });
      }}
    >
      {batchStepLabel(batch.step, n)}
    </Button>
  );
}
