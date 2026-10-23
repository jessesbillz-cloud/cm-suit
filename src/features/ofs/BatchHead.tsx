// The head of requests filed together (0113): "Batch of 9", and the one tap for its requests waiting on me (0114).
import type { IrBatch } from '../../data/inspections.batch';
import { BatchAction } from '../inspections/BatchAction';

/** The batches waiting on me, by id (ir_batches_waiting). */
export type WaitingBatches = ReadonlyMap<string, IrBatch>;

interface BatchHeadProps {
  batchId: string;
  size: number;
  waiting: WaitingBatches;
  className?: string | undefined;
}

export function BatchHead({ batchId, size, waiting, className = '' }: BatchHeadProps) {
  const batch = waiting.get(batchId);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="heading text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">{`Batch of ${String(size)}`}</span>
      {batch ? <BatchAction batch={batch} /> : null}
    </div>
  );
}

export function waitingById(batches: readonly IrBatch[] | undefined): WaitingBatches {
  return new Map((batches ?? []).map((b) => [b.batch_id, b]));
}
