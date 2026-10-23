// "Needs you" for a batch (0114): requests filed together that wait on me sit on one line, "Batch of 9 · Level 01 ·
// Top of wall", with the one tap for all of them and Open (the first of them, whose page lists the rest).
import { Layers } from 'lucide-react';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import { waitingOf, type IrBatch } from '../../data/inspections.batch';
import { entityTarget } from '../../lib/entityTarget';
import { Button } from '../../ui/Button';
import { BatchAction } from '../inspections/BatchAction';
import { NeedsRow } from './NeedsRow';

interface BatchNeedsLineProps {
  batch: IrBatch;
  /** The job's name on All my jobs, else null. */
  jobName: string | null;
  className: string;
}

export function BatchNeedsLine({ batch, jobName, className }: BatchNeedsLineProps) {
  const openTarget = useOpenTarget();
  const first = waitingOf(batch)[0] ?? batch.requests[0];
  const target = first ? entityTarget('inspection_request', first.id) : null;
  return (
    <NeedsRow
      testId="needs-you-batch"
      icon={Layers}
      title={`Batch of ${String(batch.size)}${batch.items === '' ? '' : ` · ${batch.items}`}`}
      meta={jobName ?? ''}
      end={
        <span className="flex flex-wrap items-center gap-2">
          <BatchAction batch={batch} className={className} />
          {target ? (
            <Button
              size="sm"
              variant="quiet"
              className={className}
              data-testid="batch-open"
              onClick={() => {
                openTarget(batch.project_id, target);
              }}
            >
              Open
            </Button>
          ) : null}
        </span>
      }
    />
  );
}
