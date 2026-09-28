// After a request is sent: the IR number the database gave it, what was asked, and who has it now (wording follows
// the job's GC step: it never mentions a GC when the step is off).
import { CircleCheck } from 'lucide-react';
import type { IrRowRaw } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
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
}

export function Receipt({ row, specialName, onTrack, onAnother }: ReceiptProps) {
  const chip = requestChip(row);
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="ir-receipt">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <Icon icon={CircleCheck} size={18} className="text-accent" />
        Sent
      </p>
      <h2 className="text-2xl font-semibold tabular-nums text-ink" data-testid="ir-receipt-number">
        IR {row.number}
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
      <div className="flex gap-2">
        <Button variant="primary" onClick={onTrack}>
          Track it
        </Button>
        <Button onClick={onAnother}>New request</Button>
      </div>
    </div>
  );
}
