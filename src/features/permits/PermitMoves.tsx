// The official's stage moves (the database's permit_next_stages, via permit_detail.moves): one primary button for the
// usual next stage; the other moves (reject, back to review, cancel ...) in a small menu. No "are you sure": every move
// comes with Undo (CLAUDE.md rule 16), which puts it back where it was. From Issued the next stage is Inspected, which
// the database refuses while a required inspection is open: the count shows next to the button ("6 inspections open")
// and a tap answers with the database's own words.
import { useState } from 'react';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useMovePermit, useUndoMove } from '../../data/permits.mutations';
import type { PermitDetail } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { DropMenu } from './DropMenu';
import { inspectedHold, moveLabel, movedLabel } from './model';

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
  const hold = inspectedHold(detail.moves, detail.open_inspections);

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
      {hold ? (
        <span className="text-[13px] leading-5 text-ink-2" data-testid="permit-move-hold">
          {hold}
        </span>
      ) : null}
      <DropMenu open={menu} align="left" onClose={() => { setMenu(false); }}>
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
      </DropMenu>
    </div>
  );
}
