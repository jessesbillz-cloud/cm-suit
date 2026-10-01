// The official's stage moves (the database's permit_next_stages, via permit_detail.moves): one primary button for the
// usual next stage; the other moves (reject, back to review, cancel ...) in a small menu. No "are you sure": every move
// comes with Undo (CLAUDE.md rule 16), which puts it back where it was.
import { useState } from 'react';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useMovePermit, useUndoMove } from '../../data/permits.mutations';
import type { PermitDetail } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { moveLabel, movedLabel } from './model';

interface PermitMovesProps {
  detail: PermitDetail;
}

export function PermitMoves({ detail }: PermitMovesProps) {
  const move = useMovePermit();
  const undo = useUndoMove();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [primary, ...others] = detail.moves;
  if (primary === undefined) return null;

  function go(stage: string) {
    setMenu(false);
    move.mutate(
      { ref: detail.permit, stage },
      {
        onSuccess: (row) => {
          toast.show({
            message: movedLabel(stage),
            action: {
              label: 'Undo',
              onClick: () => {
                undo.mutate(row, {
                  onError: (e) => {
                    toast.show({ tone: 'error', message: messageOf(e) });
                  },
                });
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2" data-testid="permit-moves">
      <Button
        variant="primary"
        icon={ArrowRight}
        loading={move.isPending}
        data-testid="permit-move"
        onClick={() => {
          go(primary);
        }}
      >
        {moveLabel(primary)}
      </Button>
      {others.length > 0 ? (
        <Button
          variant="secondary"
          icon={Ellipsis}
          aria-label="Other moves"
          aria-expanded={menu}
          data-testid="permit-move-menu"
          onClick={() => {
            setMenu(!menu);
          }}
        />
      ) : null}
      {menu ? (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 flex min-w-[12rem] flex-col rounded-lg border border-line bg-card py-1 shadow-pop">
          {others.map((stage) => (
            <button
              key={stage}
              type="button"
              role="menuitem"
              data-testid={`permit-move-${stage}`}
              className={`px-3.5 py-2 text-left text-sm hover:bg-page ${stage === 'cancelled' || stage === 'rejected' ? 'text-danger' : 'text-ink'}`}
              onClick={() => {
                go(stage);
              }}
            >
              {moveLabel(stage)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
