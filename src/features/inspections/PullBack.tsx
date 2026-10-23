// The request's walls for whoever may take them off (pullBack.mayPullBack), until the fire marshal records a result:
// each wall with Not ready, and on a wall with more than one item each item with its own. One tap, Undo in the toast,
// never a question. What comes off is open again on the Inspection card and gone from the request for everyone
// (ir_rev_pull_back); everything off withdraws it.
import { messageOf } from '../../data/errors';
import type { IrRequest } from '../../data/inspections.types';
import { usePullBack } from '../../data/irPullBack';
import type { IrRevItem, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { Swatch } from '../revs/map/MarkupBar';
import { WithSetup } from './RevCells';
import { pullWalls, takenOffMessage, type PullWall } from './pullBack';

interface BodyProps {
  row: IrRequest;
  cells: readonly IrRevItem[];
  setup: RevSetup;
}

function PullBackBody({ row, cells, setup }: BodyProps) {
  const pull = usePullBack();
  const toast = useToast();
  const walls = pullWalls(cells, setup);

  function takeOff(wall: PullWall, only: IrRevItem | null) {
    const off = (only === null ? wall.items.map((i) => i.cell) : [only]).map((c) => ({ area_id: c.area_id, item_id: c.item_id }));
    const item = only === null ? null : (wall.items.find((i) => i.cell.id === only.id) ?? null);
    pull.mutate(
      { row, cells: off, back: false },
      {
        onSuccess: (next) => {
          toast.show({
            message: next.status === 'withdrawn' ? `${takenOffMessage(wall, item)} Nothing left: withdrawn.` : takenOffMessage(wall, item),
            action: {
              label: 'Undo',
              onClick: () => {
                pull.mutate(
                  { row: { id: next.id, version: next.version, project_id: next.project_id }, cells: off, back: true },
                  {
                    onError: (e) => {
                      toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
                    },
                  },
                );
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not taken off: ${messageOf(e)}` });
        },
      },
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="ir-pull-back">
      {walls.map((w) => (
        <li key={w.areaId} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0" data-testid={`ir-pull-${w.areaId}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words text-sm font-semibold text-ink">{w.label}</span>
            <Button
              size="sm"
              disabled={pull.isPending}
              aria-label={`${w.label}: not ready`}
              data-testid={`ir-pull-wall-${w.areaId}`}
              onClick={() => {
                takeOff(w, null);
              }}
            >
              Not ready
            </Button>
          </div>
          {w.items.map((i) => (
            <div key={i.cell.id} className="flex items-center justify-between gap-3 pl-1">
              <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                <Swatch color={i.color} />
                <span className="break-words">{i.name}</span>
              </span>
              {w.items.length > 1 ? (
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={pull.isPending}
                  aria-label={`${w.label} · ${i.name}: not ready`}
                  data-testid={`ir-pull-cell-${i.cell.area_id}-${i.cell.item_id}`}
                  onClick={() => {
                    takeOff(w, i.cell);
                  }}
                >
                  Not ready
                </Button>
              ) : null}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

export function PullBack({ row, cells }: { row: IrRequest; cells: readonly IrRevItem[] }) {
  return <WithSetup projectId={row.project_id}>{(setup) => <PullBackBody row={row} cells={cells} setup={setup} />}</WithSetup>;
}
