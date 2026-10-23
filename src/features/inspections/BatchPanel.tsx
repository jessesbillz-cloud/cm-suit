// A request filed in a batch (0113, 0114): the batch on one line ("Batch of 9 · Level 01 · Top of wall"), the one tap
// for its requests waiting on me, and every request of it, each opening its own page (this one marked).
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import { useIrBatch } from '../../data/inspections.batch';
import type { IrRequest } from '../../data/inspections.types';
import { useIrBatches } from '../../data/revs.basket';
import { entityTarget } from '../../lib/entityTarget';
import { ofsIrLabel } from '../../lib/markup';
import { CLICK_BOX } from '../../ui/box';
import { PaneSection } from '../../ui/ReadingPane';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { BatchAction } from './BatchAction';
import { firstLine, requestChip } from './model';

export function BatchPanel({ row, ofsDecide }: { row: IrRequest; ofsDecide: boolean }) {
  const openTarget = useOpenTarget();
  const batched = useIrBatches([row.id]);
  const of = batched.data?.get(row.id);
  const inOne = of !== undefined && of.size >= 2;
  const batch = useIrBatch(row.project_id, inOne ? of.batchId : null);
  if (batched.isError) return <ErrorState error={batched.error} onRetry={() => void batched.refetch()} className="m-0" />;
  if (!inOne) return null;
  if (batch.isError) return <ErrorState error={batch.error} onRetry={() => void batch.refetch()} className="m-0" />;
  if (batch.isPending) return <LoadingState label="Loading the batch" />;
  const b = batch.data;
  return (
    <PaneSection testId="ir-batch">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 break-words text-sm font-semibold text-ink wrap-anywhere" data-testid="ir-batch-line">
          {`Batch of ${String(b.size)}${b.items === '' ? '' : ` · ${b.items}`}`}
        </p>
        <BatchAction batch={b} />
      </div>
      <ul className="flex flex-col gap-1">
        {b.requests.map((r) => {
          const chip = requestChip({ ...r, kind: 'ofs' }, ofsDecide);
          const here = r.id === row.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-current={here ? 'page' : undefined}
                className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left ${here ? 'bg-accent-soft/60' : CLICK_BOX}`}
                data-testid="ir-batch-request"
                data-waits={r.waits}
                onClick={() => {
                  const target = entityTarget('inspection_request', r.id);
                  if (!here && target) openTarget(row.project_id, target);
                }}
              >
                <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold tabular-nums text-ink">
                  {r.ofs_number === null ? `IR ${String(r.number)}` : `${ofsIrLabel(r.ofs_number)} · IR ${String(r.number)}`}
                  <StatusChip status={chip.status} label={chip.label} />
                </span>
                <span className="break-words text-[13px] text-ink-2 wrap-anywhere">{firstLine(r.items)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </PaneSection>
  );
}
