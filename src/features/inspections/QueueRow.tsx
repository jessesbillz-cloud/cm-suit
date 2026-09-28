// One line of the inspector's day: time, IR number, type, company, what, status, attendance; Confirm in one tap.
import { Check, X } from 'lucide-react';
import type { CalendarRow } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { attendanceLabel, firstLine, rowChip, typeLabel } from './model';
import { clockLabel, durationLabel } from './time';

interface QueueRowProps {
  row: CalendarRow;
  selected: boolean;
  confirming: boolean;
  onOpen: (id: string) => void;
  onConfirm: (row: CalendarRow) => void;
  onRemoveBlock: (row: CalendarRow) => void;
}

export function QueueRow({ row, selected, confirming, onOpen, onConfirm, onRemoveBlock }: QueueRowProps) {
  const chip = rowChip(row);
  const when = row.duration_kind === 'all_day' ? 'All day' : clockLabel(row.start_time);
  const attendance = attendanceLabel(row.attendance);

  if (row.is_block) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-2" data-testid="ir-block-row">
        <span className="w-20 shrink-0 tabular-nums">{when}</span>
        <span className="flex-1">
          <StatusChip status={chip.status} label={chip.label} />
          {row.duration_kind === 'timed' ? <span className="ml-2">{durationLabel('timed', row.duration_min)}</span> : null}
        </span>
        <Button
          size="sm"
          variant="quiet"
          icon={X}
          aria-label="Remove blocked time"
          onClick={() => {
            onRemoveBlock(row);
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${selected ? 'bg-accent-soft' : 'hover:bg-page'}`}
      data-testid={`ir-queue-${String(row.number)}`}
      onClick={() => {
        if (row.id !== null) onOpen(row.id);
      }}
    >
      <span className="w-20 shrink-0 pt-0.5 text-sm tabular-nums text-ink-2">{when}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink">
          <span className="mr-2 tabular-nums text-ink-2">IR {row.number}</span>
          {typeLabel(row.kind, row.special_kind)} · {row.company}
        </p>
        <p className="break-words text-sm text-ink-2">{firstLine(row.items ?? '')}</p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          <StatusChip status={chip.status} label={chip.label} />
          {attendance ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">{attendance}</span> : null}
        </p>
      </div>
      {row.status === 'pending' ? (
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          loading={confirming}
          data-testid={`ir-confirm-${String(row.number)}`}
          onClick={(e) => {
            e.stopPropagation();
            onConfirm(row);
          }}
        >
          Confirm
        </Button>
      ) : null}
    </li>
  );
}
