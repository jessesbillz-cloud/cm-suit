// The wall's items as big boxes that say what each one is, in rev order under the rev's name, each the whole box in its
// state (StateBox, Jesse Oct 12: "If an item is signed off, the whole box should be green"). Items not applicable on
// this wall are not shown, nor a rev left with none. A tap on a box shows the item on the 3-D wall (ringed). Whoever
// files OFS requests has Add under each box still to ask for (open or failed; Jesse, Oct 23: "OK, I want to get the
// top of wall inspected on this one - click the button - and that gets added"): the box turns black and Add says In
// request; a tap takes it out again. A manager signs off a whole rev on this wall before the app (0082) from its line,
// and sees the items switched off here last, dashed ("Not needed here"), to switch one back.
import { Check, Plus } from 'lucide-react';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import type { Rev } from '../../data/revs.types';
import { boxState } from './boxLook';
import { shortItem } from './itemLines';
import { canAsk, canSignBefore, chipOf, type WallRev } from './model';
import { StateBox } from './StateBox';
import type { WallItem, WallPick } from './wallPage';

/** The request being built, for this wall: what is in it, and a tap in or out. */
interface WallBasket {
  has: (itemId: string) => boolean;
  toggle: (itemId: string) => void;
  busy: boolean;
}

interface WallItemsProps {
  /** The wall's revs; with the N/A items for a manager. */
  revs: readonly WallRev[];
  items: readonly WallItem[];
  pick: WallPick;
  onTap: (item: WallItem) => void;
  /** Those who file OFS requests: Add under each box still to ask for. */
  basket: WallBasket | null;
  /** A manager: the rev's items still to do, signed off before the app at once. */
  onSignRev?: ((rev: Rev, itemIds: string[]) => void) | undefined;
}

const HEAD = 'heading min-w-0 flex-1 break-words text-[13px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink';
const ADD = 'heading flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border-[1.5px] px-2 text-[13px] font-semibold uppercase tracking-[0.06em] shadow-tile transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-tile-hover active:translate-y-0 active:shadow-press disabled:opacity-60';

interface BoxProps {
  item: WallItem;
  pick: WallPick;
  onTap: (item: WallItem) => void;
  basket: WallBasket | null;
}

function ItemBox({ item, pick, onTap, basket }: BoxProps) {
  const id = item.item.id;
  const state = boxState(item.cell.status);
  const addable = basket !== null && canAsk(item.cell.status);
  const inIt = addable && basket.has(id);
  const box = (
    <StateBox
      state={state ?? 'open'}
      off={state === null}
      // Under its rev's name, the words it repeats from it go ("Speed Plugs" under "TOW"). Switched off: all of it.
      label={state === null ? item.item.name : shortItem(item.item.name, item.rev.name)}
      name={`${item.item.name}: ${inIt ? 'In request' : chipOf(item.cell.status).label}`}
      picked={inIt}
      focus={pick.focus === id}
      status={item.cell.status}
      wide={basket !== null}
      testId={`rev-item-${id}`}
      onClick={() => {
        onTap(item);
      }}
    />
  );
  if (basket === null) return box;
  return (
    <div className="flex flex-col gap-1.5">
      {box}
      {addable ? (
        <button
          type="button"
          className={`${ADD} ${inIt ? 'border-ink bg-ink text-white' : 'border-ink bg-card text-ink'}`}
          aria-pressed={inIt}
          disabled={basket.busy}
          data-testid={`rev-add-${id}`}
          data-in={inIt ? 'true' : undefined}
          onClick={() => {
            basket.toggle(id);
          }}
        >
          <Icon icon={inIt ? Check : Plus} size={16} />
          {inIt ? 'In request' : 'Add'}
        </button>
      ) : null}
    </div>
  );
}

export function WallItems({ revs, items, pick, onTap, basket, onSignRev }: WallItemsProps) {
  const byId = new Map(items.map((i) => [i.item.id, i]));
  const shown = revs.map((r) => ({ ...r, cells: r.cells.filter((c) => c.cell.status !== 'na') })).filter((r) => r.cells.length > 0);
  const off = items.filter((i) => i.cell.status === 'na');
  if (shown.length === 0 && off.length === 0) return <EmptyState title="Nothing to inspect on this wall." />;
  const box = (id: string, withBasket: boolean) => {
    const it = byId.get(id);
    return it ? <ItemBox key={id} item={it} pick={pick} onTap={onTap} basket={withBasket ? basket : null} /> : null;
  };
  // With Add under each box, the boxes sit in a grid of big tiles (thumb-sized); without, they wrap as words.
  const group = basket === null ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]';
  return (
    <div className="flex flex-col gap-4" data-testid="rev-items">
      {shown.map(({ rev, cells }) => {
        const toSign = cells.filter((c) => canSignBefore(c.cell.status)).map((c) => c.item.id);
        return (
          <section key={rev.id} className="flex flex-col gap-2" data-testid={`rev-section-${String(rev.number)}`}>
            <div className="flex items-end gap-2 border-b-2 border-ink pb-0.5">
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
            <div role="group" aria-label={rev.name} className={group} data-testid="rev-item">
              {cells.map((c) => box(c.item.id, true))}
            </div>
          </section>
        );
      })}
      {off.length > 0 ? (
        <section className="flex flex-col gap-2 border-t border-line pt-3" data-testid="rev-items-off">
          <h3 className={`${HEAD} text-ink-3`}>Not needed here</h3>
          <div role="group" aria-label="Not needed here" className="flex flex-wrap gap-2">
            {off.map((i) => box(i.item.id, false))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
