// After a request is sent: the IR number the database gave it (and its OFS IR number), what was asked, and who has it
// now (wording follows the job's GC step: it never mentions a GC when the step is off). An OFS request with walls
// shows its map right here (children), to draw while on the spot.
import type { ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import type { IrRowRaw } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
import { ofsIrLabel } from '../../lib/markup';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { requestChip, typeLabel } from './model';
import { clockLabel, durationLabel } from './time';

interface ReceiptProps {
  row: IrRowRaw;
  specialName: string | null;
  onTrack: () => void;
  onAnother: () => void;
  children?: ReactNode | undefined;
}

export function Receipt({ row, specialName, onTrack, onAnother, children }: ReceiptProps) {
  const chip = requestChip(row);
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="ir-receipt">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <Icon icon={CircleCheck} size={18} className="text-accent" />
        Sent
      </p>
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tabular-nums text-ink">
        <span data-testid="ir-receipt-number">IR {row.number}</span>
        {row.ofs_number !== null ? (
          <span className="text-base font-medium text-ink-2" data-testid="ir-receipt-ofs">
            {ofsIrLabel(row.ofs_number)}
          </span>
        ) : null}
      </h2>
      <p className="text-sm text-ink">
        {formatDay(row.request_date, 'EEE, MMM d')} · {clockLabel(row.start_time)} · {durationLabel(row.duration_kind, row.duration_min)}
      </p>
      <p className="break-words text-sm text-ink">
        {typeLabel(row.kind, specialName)} · {row.company}
      </p>
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <StatusChip status={chip.status} label={chip.label} />
        {row.status === 'gc_review' ? 'Waiting on the GC.' : 'Waiting on the inspector.'}
      </p>
      {children}
      <div className="flex gap-2">
        <Button variant={children ? 'secondary' : 'primary'} onClick={onTrack}>
          Track it
        </Button>
        <Button onClick={onAnother}>New request</Button>
      </div>
    </div>
  );
}
