// Postpone is not cancel: a reason (Other needs a note), an optional expected day. The request keeps its day with a
// postponed chip and frees its slot; the requester gets a board line; an existing IR PDF is stamped POSTPONED.
// The Postpone button that opens this sits with Move in the inspector's steps.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { usePostponeIr, useRestampIr } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from './ChoiceRow';
import { POSTPONE_REASONS } from './model';

type Reason = (typeof POSTPONE_REASONS)[number]['value'];

/** Requests that may be postponed (a postponed one is confirmed again instead). */
export function canPostpone(status: string): boolean {
  return ['pending', 'confirmed', 'complete'].includes(status);
}

export function PostponeForm({ row, onDone }: { row: IrRequest; onDone: () => void }) {
  const postpone = usePostponeIr();
  const restamp = useRestampIr();
  const toast = useToast();
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const ready = reason !== null && (reason !== 'other' || note.trim() !== '');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3" data-testid="ir-postpone">
      <ChoiceRow label="Reason" options={POSTPONE_REASONS} value={reason} onPick={setReason} testId="ir-postpone-reason" />
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label="Note" value={note} onChange={setNote} />
        <TextField label="Expected" type="date" value={until} onChange={setUntil} />
      </div>
      {postpone.isError ? <p className="text-sm text-danger">{messageOf(postpone.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!ready}
          loading={postpone.isPending}
          onClick={() => {
            if (reason === null) return;
            postpone.mutate(
              { row, reason, note, until: until === '' ? null : until },
              {
                onSuccess: (done) => {
                  // This form closes now: the promise (not per-call callbacks) reports a failed stamp.
                  if (done.ir_file_id !== null) {
                    restamp.mutateAsync(done).catch((e: unknown) => {
                      toast.show({ tone: 'error', message: `PDF not stamped: ${messageOf(e)}` });
                    });
                  }
                  onDone();
                },
              },
            );
          }}
        >
          Postpone
        </Button>
      </div>
    </div>
  );
}
