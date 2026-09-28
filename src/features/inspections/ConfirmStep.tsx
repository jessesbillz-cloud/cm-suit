// Confirm (silent: the calendar is the confirmation), with an optional note the GC sees. A postponed request is
// confirmed again from here, and an IR PDF that carries the POSTPONED mark is re-stamped without it.
import { useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useConfirmIr, useRestampIr, useUnconfirmIr } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

export function ConfirmStep({ row }: { row: IrRequest }) {
  const confirm = useConfirmIr();
  const unconfirm = useUnconfirmIr();
  const restamp = useRestampIr();
  const toast = useToast();
  const [note, setNote] = useState(row.confirm_note ?? '');
  const onError = (e: Error) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  if (row.status === 'confirmed' && row.result === null) {
    return (
      <div>
        <Button
          size="sm"
          variant="quiet"
          icon={Undo2}
          loading={unconfirm.isPending}
          onClick={() => {
            unconfirm.mutate(row, { onError });
          }}
        >
          Back to pending
        </Button>
      </div>
    );
  }
  if (row.status !== 'pending' && row.status !== 'postponed') return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextField label="Note for the GC" value={note} onChange={setNote} className="min-w-48 flex-1" testId="ir-confirm-note" />
      <Button
        variant="primary"
        icon={Check}
        loading={confirm.isPending}
        data-testid="ir-confirm"
        onClick={() => {
          confirm.mutate(
            { row, note },
            {
              onSuccess: (done) => {
                if (done.ir_file_id !== null && done.pdf_postponed) restamp.mutate(done, { onError });
              },
              onError,
            },
          );
        }}
      >
        {row.status === 'postponed' ? 'Confirm again' : 'Confirm'}
      </Button>
    </div>
  );
}
