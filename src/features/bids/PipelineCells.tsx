// The pieces of a pipeline row, shared by the desktop table and the phone list: the bid due (date in the job's zone
// plus "in 3 days"), packages covered (x of y with a thin bar), and the stage chip.
import type { PipelineRow } from '../../data/bids.pipeline';
import { isBidStage } from '../../lib/jobs';
import { StatusChip } from '../../ui/StatusChip';
import { coverage, dueDate, dueRelative, stageChip } from './pipeline';

export function StageCell({ stage }: { stage: string }) {
  const chip = stageChip(stage);
  return <StatusChip status={chip.status} label={chip.label} />;
}

/** "Oct 1, 2:00 PM" and, while the bid is open, "in 3 days" / "today" / "past". */
export function DueCell({ row, inline = false }: { row: PipelineRow; inline?: boolean }) {
  if (row.bid_due_at === null) return <span className="text-ink-3">No date</span>;
  const rel = isBidStage(row.stage) ? dueRelative(row.bid_due_at, row.timezone) : null;
  const soon = rel === 'today' || rel === 'tomorrow';
  const relClass = soon ? 'font-medium text-accent' : 'text-ink-2';
  return (
    <span className={inline ? 'inline-flex flex-wrap gap-x-1.5' : 'flex flex-col'}>
      <span className="tabular-nums text-ink">{dueDate(row.bid_due_at, row.timezone)}</span>
      {rel !== null ? <span className={`text-xs ${inline ? 'self-center' : ''} ${relClass}`}>{rel}</span> : null}
    </span>
  );
}

/** "7 of 12" over a thin bar: packages with at least one current bid. */
export function PackagesCell({ row }: { row: PipelineRow }) {
  const share = coverage(row);
  if (share === null) return <span className="text-ink-3">No packages</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className="tabular-nums text-ink">
        {row.packages_covered} <span className="text-ink-2">of {row.packages}</span>
      </span>
      <span className="block h-1 w-full max-w-28 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${String(Math.round(share * 100))}%` }} />
      </span>
    </span>
  );
}
