// A wall's revs, each with its items: the status chip (lib/status), the item and who does it, the request that decided
// it ("IR 12 · OFS 0065 · Oct 2", a tap opens it in Inspections) and, when it failed, why in red. Managers mark an item
// the wall doesn't need N/A, or clear it, at once; the toast offers Undo (no "are you sure").
import type { RevArea, RevItem } from '../../data/revs.types';
import { messageOf } from '../../data/errors';
import { useMarkRevNa } from '../../data/revs.mutations';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { chipOf, irLine, naToggle, type WallCell, type WallRev } from './model';

interface WallRevsProps {
  projectId: string;
  area: RevArea;
  revs: readonly WallRev[];
  timeZone: string;
  canManage: boolean;
  onOpenRequest: (requestId: string) => void;
}

interface ItemLineProps {
  cell: WallCell;
  timeZone: string;
  /** Managers: mark N/A or clear it. */
  onNa: ((item: RevItem, on: boolean) => void) | undefined;
  busy: boolean;
  onOpenRequest: (requestId: string) => void;
}

function ItemLine({ cell: { item, cell }, timeZone, onNa, busy, onOpenRequest }: ItemLineProps) {
  const chip = chipOf(cell.status);
  const ir = irLine(cell, timeZone);
  const toggle = onNa ? naToggle(cell.status) : null;
  const requestId = cell.request_id;
  return (
    <li className="flex items-start gap-3 py-2" data-testid={`rev-item-${item.id}`} data-status={cell.status}>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14.5px] leading-6 text-ink">
          {item.name}
          {item.company ? <span className="ml-1.5 inline-block text-[13px] text-ink-3">{item.company}</span> : null}
        </p>
        {ir !== null && requestId !== null ? (
          <button
            type="button"
            className="text-left text-[13px] font-medium tabular-nums leading-5 text-accent hover:underline"
            data-testid="rev-ir-link"
            onClick={() => {
              onOpenRequest(requestId);
            }}
          >
            {ir}
          </button>
        ) : null}
        {cell.status === 'failed' && cell.note ? (
          <p className="break-words text-[13px] leading-5 text-danger" data-testid="rev-item-note">
            {cell.note}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {toggle && onNa ? (
          <button
            type="button"
            className="-my-1 min-h-8 rounded-md px-1.5 text-[12.5px] font-medium text-accent hover:bg-accent-soft disabled:text-ink-3"
            disabled={busy}
            data-testid="rev-na"
            onClick={() => {
              onNa(item, toggle === 'mark');
            }}
          >
            {toggle === 'mark' ? 'Mark N/A' : 'Clear N/A'}
          </button>
        ) : null}
        <StatusChip status={chip.key} label={chip.label} />
      </div>
    </li>
  );
}

export function WallRevs({ projectId, area, revs, timeZone, canManage, onOpenRequest }: WallRevsProps) {
  const mark = useMarkRevNa();
  const toast = useToast();
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const setNa = (item: RevItem, on: boolean) => {
    mark.mutate(
      { projectId, areaId: area.id, itemId: item.id, on },
      {
        onSuccess: () => {
          toast.show({
            message: on ? `${item.name}: N/A.` : `${item.name}: needed again.`,
            // mutateAsync settles even if this wall has closed meanwhile.
            action: { label: 'Undo', onClick: () => { void mark.mutateAsync({ projectId, areaId: area.id, itemId: item.id, on: !on }).catch(failed); } },
          });
        },
        onError: failed,
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {revs.map(({ rev, cells }) => (
        <section key={rev.id} className="flex flex-col" data-testid={`rev-section-${String(rev.number)}`}>
          <h2 className="border-b border-line pb-1 text-[11.5px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-2">
            Rev {rev.number} · {rev.name}
          </h2>
          {cells.length > 0 ? (
            <ul className="divide-y divide-line">
              {cells.map((c) => (
                <ItemLine
                  key={c.item.id}
                  cell={c}
                  timeZone={timeZone}
                  busy={mark.isPending}
                  onNa={canManage ? setNa : undefined}
                  onOpenRequest={onOpenRequest}
                />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-[13px] text-ink-3">No items.</p>
          )}
        </section>
      ))}
    </div>
  );
}
