// The wall's items as buttons that say what each one is (MDR's Special kinds; ui/ChipPick), in rev order with only a
// thin rev line between groups. Each has its status dot (lib/status). A tap shows the item on the 3-D wall; one still
// to ask for is also picked for the request (picked: filled; shown: ringed). A manager signs off a whole rev on this
// wall before the app (0082) from its line: the items not yet passed or N/A.
import { ChipPick, type Chip } from '../../ui/ChipPick';
import { EmptyState } from '../../ui/States';
import type { Rev } from '../../data/revs.types';
import { canSignBefore, chipOf, type WallRev } from './model';
import type { WallItem, WallPick } from './wallPage';

interface WallItemsProps {
  revs: readonly WallRev[];
  items: readonly WallItem[];
  pick: WallPick;
  onTap: (item: WallItem) => void;
  /** A manager: the rev's items still to do, signed off before the app at once. */
  onSignRev?: ((rev: Rev, itemIds: string[]) => void) | undefined;
}

function StatusDot({ status }: { status: WallItem['cell']['status'] }) {
  const { key } = chipOf(status);
  const open = status === 'open';
  return (
    <span
      aria-hidden
      data-status={status}
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={open ? { boxShadow: `inset 0 0 0 1.5px var(--status-${key}-dot)` } : { background: `var(--status-${key}-dot)` }}
    />
  );
}

/** The one value a tap changed between two picked lists. */
function tapped(before: readonly string[], after: readonly string[]): string | undefined {
  return after.find((v) => !before.includes(v)) ?? before.find((v) => !after.includes(v));
}

export function WallItems({ revs, items, pick, onTap, onSignRev }: WallItemsProps) {
  if (revs.length === 0) return <EmptyState title="This wall's list has no revs yet." />;
  const byId = new Map(items.map((i) => [i.item.id, i]));
  return (
    <div className="flex flex-col gap-3" data-testid="rev-items">
      {revs.map(({ rev, cells }) => {
        const chips: Chip<string>[] = cells.map(({ item, cell }) => ({
          value: item.id,
          label: item.name,
          mark: <StatusDot status={cell.status} />,
          title: chipOf(cell.status).label,
        }));
        const toSign = cells.filter((c) => canSignBefore(c.cell.status)).map((c) => c.item.id);
        return (
          <section key={rev.id} className="flex flex-col gap-1.5" data-testid={`rev-section-${String(rev.number)}`}>
            <div className="flex items-end gap-2 border-b border-line pb-0.5">
              <h3 className="min-w-0 flex-1 break-words text-[12px] font-semibold uppercase leading-5 tracking-[0.05em] text-ink-3">
                Rev {rev.number} · {rev.name}
              </h3>
              {onSignRev && toSign.length > 0 ? (
                <button
                  type="button"
                  className="-mb-0.5 shrink-0 rounded px-1.5 text-[12px] font-medium leading-5 text-accent hover:bg-accent-soft"
                  data-testid="rev-before-rev"
                  onClick={() => {
                    onSignRev(rev, toSign);
                  }}
                >
                  Signed off before
                </button>
              ) : null}
            </div>
            {chips.length > 0 ? (
              <ChipPick
                label={`Rev ${String(rev.number)} ${rev.name}`}
                chips={chips}
                picked={pick.picked}
                focus={pick.focus}
                multiple
                testId="rev-item"
                onChange={(next) => {
                  const id = tapped(pick.picked, next);
                  const hit = id === undefined ? undefined : byId.get(id);
                  if (hit) onTap(hit);
                }}
              />
            ) : (
              <p className="text-[13px] text-ink-3">No items.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
