// The wall's items as big boxes that say what each one is, in rev order under the rev's name, each the whole box in its
// state (StateBox, Jesse Oct 12: "If an item is signed off, the whole box should be green"). Items not applicable on
// this wall are not shown, nor a rev left with none. A tap shows the item on the 3-D wall; one still to ask for is also
// picked for the request (picked: the accent; shown: ringed). A manager signs off a whole rev on this wall before the
// app (0082) from its line, and sees the items switched off here last, dashed ("Not needed here"), to switch one back.
import { EmptyState } from '../../ui/States';
import type { Rev } from '../../data/revs.types';
import { boxState } from './boxLook';
import { shortItem } from './itemLines';
import { canSignBefore, chipOf, type WallRev } from './model';
import { StateBox } from './StateBox';
import type { WallItem, WallPick } from './wallPage';

interface WallItemsProps {
  /** The wall's revs; with the N/A items for a manager. */
  revs: readonly WallRev[];
  items: readonly WallItem[];
  pick: WallPick;
  onTap: (item: WallItem) => void;
  /** A manager: the rev's items still to do, signed off before the app at once. */
  onSignRev?: ((rev: Rev, itemIds: string[]) => void) | undefined;
}

const HEAD = 'min-w-0 flex-1 break-words text-[13px] font-bold uppercase leading-5 tracking-[0.05em] text-ink';

function ItemBox({ item, pick, onTap }: { item: WallItem; pick: WallPick; onTap: (item: WallItem) => void }) {
  const id = item.item.id;
  const state = boxState(item.cell.status);
  return (
    <StateBox
      state={state ?? 'open'}
      off={state === null}
      // Under its rev's name, the words it repeats from it go ("Speed Plugs" under "TOW"). Switched off: all of it.
      label={state === null ? item.item.name : shortItem(item.item.name, item.rev.name)}
      name={`${item.item.name}: ${chipOf(item.cell.status).label}`}
      picked={pick.picked.includes(id)}
      pressed={pick.picked.includes(id)}
      focus={pick.focus === id}
      status={item.cell.status}
      testId={`rev-item-${id}`}
      onClick={() => {
        onTap(item);
      }}
    />
  );
}

export function WallItems({ revs, items, pick, onTap, onSignRev }: WallItemsProps) {
  const byId = new Map(items.map((i) => [i.item.id, i]));
  const shown = revs.map((r) => ({ ...r, cells: r.cells.filter((c) => c.cell.status !== 'na') })).filter((r) => r.cells.length > 0);
  const off = items.filter((i) => i.cell.status === 'na');
  if (shown.length === 0 && off.length === 0) return <EmptyState title="Nothing to inspect on this wall." />;
  const box = (id: string) => {
    const it = byId.get(id);
    return it ? <ItemBox key={id} item={it} pick={pick} onTap={onTap} /> : null;
  };
  return (
    <div className="flex flex-col gap-4" data-testid="rev-items">
      {shown.map(({ rev, cells }) => {
        const toSign = cells.filter((c) => canSignBefore(c.cell.status)).map((c) => c.item.id);
        return (
          <section key={rev.id} className="flex flex-col gap-2" data-testid={`rev-section-${String(rev.number)}`}>
            <div className="flex items-end gap-2">
              <h3 className={HEAD}>{rev.name}</h3>
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
            <div role="group" aria-label={rev.name} className="flex flex-wrap gap-2" data-testid="rev-item">
              {cells.map((c) => box(c.item.id))}
            </div>
          </section>
        );
      })}
      {off.length > 0 ? (
        <section className="flex flex-col gap-2 border-t border-line pt-3" data-testid="rev-items-off">
          <h3 className={`${HEAD} text-ink-3`}>Not needed here</h3>
          <div role="group" aria-label="Not needed here" className="flex flex-wrap gap-2">
            {off.map((i) => box(i.item.id))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
