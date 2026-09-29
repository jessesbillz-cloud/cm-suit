// Move a request: a new day, time or length, with that day's bookings shown first. The database decides what a move
// means (a requester's move of a confirmed request sends it back to pending and tells the inspector).
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useMoveIr } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { ConflictPreview } from './ConflictPreview';
import { durationValue, isDay, timeValue, whenOf, type WhenPick } from './time';
import { WhenFields } from './WhenFields';

interface MoveFormProps {
  row: IrRequest;
  onDone: () => void;
}

export function MoveForm({ row, onDone }: MoveFormProps) {
  const move = useMoveIr();
  const [pick, setPick] = useState<WhenPick>({
    date: row.request_date,
    time: timeValue(row.start_time),
    duration: durationValue(row.duration_kind, row.duration_min),
  });
  const when = whenOf(pick);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3" data-testid="ir-move">
      <WhenFields value={pick} onChange={setPick} testId="ir-move" />
      <ConflictPreview projectId={row.project_id} when={when} ownId={row.id} />
      {move.isError ? <p className="text-sm text-danger">{messageOf(move.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!isDay(pick.date)}
          loading={move.isPending}
          onClick={() => {
            move.mutate({ row, when }, { onSuccess: onDone });
          }}
        >
          Move
        </Button>
      </div>
    </div>
  );
}
