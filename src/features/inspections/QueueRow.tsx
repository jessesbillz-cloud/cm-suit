// One line of the inspector's day: the time (start bold, length under it), the type and IR number, what to inspect,
// the company and attendance, the status chip; Confirm in one tap on a pending request I decide.
import { CalendarOff, Check, X } from 'lucide-react';
import type { CalendarRow } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { attendanceLabel, firstLine, rowChip, typeLabel } from './model';
import { clockLabel, durationLabel } from './time';

/** The row open in the right column: a soft accent fill and a 3px accent edge on the left. */
const SELECTED = 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

interface QueueRowProps {
  row: CalendarRow;
  selected: boolean;
  /** I decide OFS requests (the deputy): one sent to OFS reads Pending to me, "With OFS" to anyone else. */
  ofsDecide: boolean;
  /** Confirm is mine to tap on this request. */
  canConfirm: boolean;
  confirming: boolean;
  onOpen: (id: string) => void;
  onConfirm: (row: CalendarRow) => void;
  onRemoveBlock: (row: CalendarRow) => void;
}

function TimeCell({ row }: { row: CalendarRow }) {
  const allDay = row.duration_kind === 'all_day';
  return (
    <div className="w-[72px] shrink-0 pt-px">
      <p className="text-sm font-semibold tabular-nums text-ink">{allDay ? 'All day' : clockLabel(row.start_time)}</p>
      {allDay ? null : <p className="text-xs text-ink-3">{durationLabel(row.duration_kind, row.duration_min)}</p>}
    </div>
  );
}

export function QueueRow({ row, selected, ofsDecide, canConfirm, confirming, onOpen, onConfirm, onRemoveBlock }: QueueRowProps) {
  const chip = rowChip(row, ofsDecide);
  const attendance = attendanceLabel(row.attendance);

  if (row.is_block) {
    return (
      <li className="flex min-h-[52px] items-center gap-3 bg-page/50 px-4 py-2.5 sm:gap-4" data-testid="ir-block-row">
        <TimeCell row={row} />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-2">
          <Icon icon={CalendarOff} size={16} className="text-ink-3" />
          <StatusChip status={chip.status} label={chip.label} />
        </span>
        <Button
          size="sm"
          variant="quiet"
          icon={X}
          className="h-10 sm:h-8"
          aria-label="Remove blocked time"
          title="Remove blocked time"
          onClick={() => {
            onRemoveBlock(row);
          }}
        />
      </li>
    );
  }

  const items = firstLine(row.items ?? '');
  return (
    <li
      // Phone: the time and two lines (the chip leads the second); Confirm under them. Desktop: one row, Confirm last.
      className={`grid min-h-[64px] cursor-pointer grid-cols-[72px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex sm:items-center sm:gap-4 ${
        selected ? SELECTED : 'hover:bg-page/60'
      }`}
      data-testid={`ir-queue-${String(row.number)}`}
      onClick={() => {
        if (row.id !== null) onOpen(row.id);
      }}
    >
      <TimeCell row={row} />
      {/* Two tight lines: the IR and its type; then what to inspect, the company and attendance. */}
      <div className="min-w-0 flex-1 wrap-anywhere">
        <p className="text-sm">
          <span className="mr-2 tabular-nums text-ink-3">IR {row.number}</span>
          <span className="font-semibold text-ink">{typeLabel(row.kind, row.special_kind)}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-ink-3">
          <span className="mr-1.5 inline-block align-middle sm:hidden">
            <StatusChip status={chip.status} label={chip.label} />
          </span>
          {items !== '' ? <span className="text-ink-2">{items}</span> : null}
          {items !== '' && row.company !== '' ? ' · ' : null}
          {row.company}
          {attendance ? <span className="ml-2 inline-block rounded-full border border-line px-2 text-xs leading-5 text-ink-2">{attendance}</span> : null}
        </p>
      </div>
      <span className="hidden shrink-0 sm:block">
        <StatusChip status={chip.status} label={chip.label} />
      </span>
      {row.status === 'pending' && canConfirm ? (
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          className="col-start-2 h-10 justify-self-start sm:h-8"
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
