// The GC step (only when the job has it on): approve, or return with a reason.
import { useState } from 'react';
import { Check, CornerUpLeft } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useGcDecide } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';

export function GcActions({ row }: { row: IrRequest }) {
  const decide = useGcDecide();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="ir-gc">
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon={Check}
          loading={decide.isPending && decide.variables.approve}
          onClick={() => {
            decide.mutate({ row, approve: true, note: '' });
          }}
        >
          Approve
        </Button>
        <Button
          icon={CornerUpLeft}
          onClick={() => {
            setReturning(!returning);
          }}
        >
          Return
        </Button>
      </div>
      {returning ? (
        <div className="flex items-end gap-2">
          <TextField label="Reason" value={reason} onChange={setReason} className="flex-1" autoFocus />
          <Button
            disabled={reason.trim() === ''}
            loading={decide.isPending && !decide.variables.approve}
            onClick={() => {
              decide.mutate(
                { row, approve: false, note: reason },
                {
                  onSuccess: () => {
                    setReturning(false);
                    setReason('');
                  },
                },
              );
            }}
          >
            Return
          </Button>
        </div>
      ) : null}
      {decide.isError ? <p className="text-sm text-danger">{messageOf(decide.error)}</p> : null}
    </div>
  );
}
