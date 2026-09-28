// The requester's own request: Move or Withdraw (Undo in the toast, no "are you sure?"). Once the inspector has a
// result or the IR is made, it stays as it is.
import { useState } from 'react';
import { CalendarClock, Undo2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRestoreIr, useWithdrawIr } from '../../data/inspections.mutations';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { MoveForm } from './MoveForm';

interface RequesterActionsProps {
  row: IrRequest;
  /** Off when I'm also its inspector: the inspector's steps have Move (one way to each thing). */
  canMove: boolean;
}

export function RequesterActions({ row, canMove }: RequesterActionsProps) {
  const [moving, setMoving] = useState(false);
  const withdraw = useWithdrawIr();
  const restore = useRestoreIr();
  const toast = useToast();

  if (row.status === 'withdrawn') {
    return (
      <div className="mt-4">
        <Button
          icon={Undo2}
          loading={restore.isPending}
          onClick={() => {
            restore.mutate(row, {
              onError: (e) => {
                toast.show({ tone: 'error', message: messageOf(e) });
              },
            });
          }}
        >
          Request again
        </Button>
      </div>
    );
  }
  if (row.status === 'complete' || row.result !== null) return null;

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {canMove ? (
          <Button
            icon={CalendarClock}
            data-testid="ir-move-open"
            onClick={() => {
              setMoving(!moving);
            }}
          >
            Move
          </Button>
        ) : null}
        <Button
          variant="danger"
          loading={withdraw.isPending}
          onClick={() => {
            withdraw.mutate(row, {
              onSuccess: (done) => {
                toast.show({
                  message: `IR ${String(done.number)} withdrawn.`,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restore.mutate(done, {
                        onError: (e) => {
                          toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
                        },
                      });
                    },
                  },
                });
              },
              onError: (e) => {
                toast.show({ tone: 'error', message: `Not withdrawn: ${messageOf(e)}` });
              },
            });
          }}
        >
          Withdraw
        </Button>
      </div>
      {moving && canMove ? (
        <MoveForm
          row={row}
          onDone={() => {
            setMoving(false);
          }}
        />
      ) : null}
    </div>
  );
}
