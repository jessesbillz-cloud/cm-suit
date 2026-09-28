// Postpone is not cancel: a reason (Other needs a note), an optional expected day. The request keeps its day with a
// postponed chip and frees its slot; the requester gets a board line; an existing IR PDF is stamped POSTPONED.
import { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { usePostponeIr, useRestampIr } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from './ChoiceRow';
import { POSTPONE_REASONS } from './model';

type Reason = (typeof POSTPONE_REASONS)[number]['value'];

export function PostponeStep({ row }: { row: IrRequest }) {
  const postpone = usePostponeIr();
  const restamp = useRestampIr();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');

  if (!['pending', 'confirmed', 'complete'].includes(row.status)) return null;
  const ready = reason !== null && (reason !== 'other' || note.trim() !== '');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          size="sm"
          icon={PauseCircle}
          data-testid="ir-postpone-open"
          onClick={() => {
            setOpen(!open);
          }}
        >
          Postpone
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="ir-postpone">
          <ChoiceRow label="Reason" options={POSTPONE_REASONS} value={reason} onPick={setReason} testId="ir-postpone-reason" />
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label="Note" value={note} onChange={setNote} />
            <TextField label="Expected" type="date" value={until} onChange={setUntil} />
          </div>
          {postpone.isError ? <p className="text-sm text-danger">{messageOf(postpone.error)}</p> : null}
          <div className="flex justify-end">
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
                      setOpen(false);
                      if (done.ir_file_id !== null) {
                        restamp.mutate(done, {
                          onError: (e) => {
                            toast.show({ tone: 'error', message: `PDF not stamped: ${messageOf(e)}` });
                          },
                        });
                      }
                    },
                  },
                );
              }}
            >
              Postpone
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
