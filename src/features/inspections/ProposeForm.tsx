// Pick another time (0108): the fire marshal's answer when the asked time doesn't work. The day and time he can make,
// with a short note; the request moves there and waits on the requester's Accept. The day's bookings show first.
import { useState } from 'react';
import { useProposeTime } from '../../data/inspections.schedule';
import type { IrRequest } from '../../data/inspections.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Fields';
import { ConflictPreview } from './ConflictPreview';
import { FLEXIBLE, TIME_OPTIONS, isDay, timeValue } from './time';

const TIMES = TIME_OPTIONS.filter((t) => t.value !== FLEXIBLE);

interface ProposeFormProps {
  row: IrRequest;
  onDone: () => void;
}

export function ProposeForm({ row, onDone }: ProposeFormProps) {
  const propose = useProposeTime();
  const [date, setDate] = useState(row.request_date);
  const [time, setTime] = useState(row.start_time === null ? (TIMES[0]?.value ?? '08:00') : timeValue(row.start_time));
  const [note, setNote] = useState('');
  const length = row.duration_kind === 'timed' ? (row.duration_min ?? 60) : 60;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3" data-testid="ofs-propose">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Day" type="date" value={date} testId="ofs-propose-date" onChange={setDate} />
        <SelectField label="Time" value={time} options={TIMES} testId="ofs-propose-time" onChange={setTime} />
      </div>
      <TextField label="Note" value={note} maxLength={500} testId="ofs-propose-note" onChange={setNote} />
      <ConflictPreview projectId={row.project_id} when={{ date, startTime: time, durationKind: 'timed', durationMin: length }} ownId={row.id} />
      {propose.isError ? <p className="text-sm text-danger">{messageOf(propose.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!isDay(date)}
          loading={propose.isPending}
          data-testid="ofs-propose-send"
          onClick={() => {
            propose.mutate({ row, date, time, note }, { onSuccess: onDone });
          }}
        >
          Send new time
        </Button>
      </div>
    </div>
  );
}
