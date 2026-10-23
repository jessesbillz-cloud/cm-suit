// One OFS request on the fire marshal's schedule: an edge in its state's color (lib/status), the time, the OFS number
// and state, the job (on All my jobs), where on the job, and who asked. The whole box opens the request.
import type { ScheduleRow } from '../../data/inspections.schedule';
import { ofsIrLabel } from '../../lib/markup';
import { StatusChip } from '../../ui/StatusChip';
import { schedChip } from './ofsSchedule';
import { clockLabel } from './time';

interface OfsBoxProps {
  row: ScheduleRow;
  selected: boolean;
  /** All my jobs: the job's name leads. */
  showJob: boolean;
  /** Needs a time: the asked day instead of a clock. */
  showDay: string | null;
  onOpen: (row: ScheduleRow) => void;
}

export function OfsBox({ row, selected, showJob, showDay, onOpen }: OfsBoxProps) {
  const chip = schedChip(row.state);
  const when = showDay ?? (row.duration_kind === 'all_day' ? 'All day' : clockLabel(row.start_time));
  return (
    <button
      type="button"
      data-testid={`ofs-box-${row.id}`}
      data-state={row.state}
      className={`flex w-full flex-col items-start gap-0.5 rounded-md border border-l-[3px] px-2 py-1.5 text-left shadow-tile transition-shadow hover:border-line-strong hover:shadow-tile-hover active:shadow-press ${
        selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent/30' : 'border-line bg-card'
      }`}
      style={{ borderLeftColor: `var(--status-${chip.status}-dot)` }}
      onClick={() => {
        onOpen(row);
      }}
    >
      <span className="flex w-full flex-wrap items-center justify-between gap-1">
        <span className="text-xs font-medium tabular-nums text-ink-2">{when}</span>
        <StatusChip status={chip.status} label={chip.label} />
      </span>
      <span className="break-words text-[13px] font-semibold leading-5 text-ink wrap-anywhere">
        {row.ofs_number === null ? `IR ${String(row.number)}` : ofsIrLabel(row.ofs_number)}
      </span>
      {showJob ? <span className="break-words text-xs font-medium text-ink wrap-anywhere">{row.project_name}</span> : null}
      {row.place ? <span className="break-words text-xs text-ink-2 wrap-anywhere">{row.place}</span> : null}
      <span className="break-words text-xs text-ink-2 wrap-anywhere">{row.requester ?? row.company}</span>
    </button>
  );
}
