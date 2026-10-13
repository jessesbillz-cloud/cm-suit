// The request picker's items: big boxes that just say what each one is (the room page's short name, itemLines: "Stuff"
// under "HOW - Cavity"), under their rev's name, only the ones the picked walls need (an item not applicable on any of
// them is not offered; Jesse, Oct 12). Each box is the whole of it in its state on those walls (StateBox): passed on
// every one green with a check, not pickable; asked for already gold; failed last time red; open white. Three at most
// (OSFM: three colors on a sheet); a picked one is the accent and carries its map color, so the picked boxes are the
// legend.
import type { MarkupColor } from '../../lib/markup';
import type { BoxState } from './boxLook';
import { Swatch } from './map/MarkupBar';
import { shortItem } from './itemLines';
import { GROUP_LABEL } from './RevWalls';
import { MAX_ITEMS, itemState, type ItemState, type RevGroup, type RevPick, type StatusIndex } from './revPick';
import { StateBox } from './StateBox';

interface RevItemsProps {
  groups: readonly RevGroup[];
  index: StatusIndex;
  pick: RevPick;
  /** The carried items' colors. */
  colors: ReadonlyMap<string, MarkupColor>;
  onToggle: (itemId: string) => void;
}

const BOX: Record<ItemState, BoxState> = { done: 'passed', requested: 'requested', failed: 'failed', open: 'open' };

export function RevItems({ groups, index, pick, colors, onToggle }: RevItemsProps) {
  const full = pick.itemIds.length >= MAX_ITEMS;
  return (
    <div className="flex flex-col gap-4" data-testid="rev-items-pick">
      {groups.map((g) => (
        <div key={g.number} className="flex flex-col gap-2">
          <span aria-hidden className={GROUP_LABEL}>
            {g.name}
          </span>
          <div role="group" aria-label={g.name} className="flex flex-wrap gap-2">
            {g.items.map((item) => {
              const state = itemState(index, item.id, pick.areaIds);
              const on = pick.itemIds.includes(item.id);
              const color = on ? colors.get(item.id) : undefined;
              // One that became done while picked can still be dropped.
              const done = state === 'done' && !on;
              return (
                <StateBox
                  key={item.id}
                  state={BOX[state]}
                  label={shortItem(item.name, g.name)}
                  name={item.name}
                  picked={on}
                  pressed={on}
                  disabled={done || (full && !on)}
                  dim={full && !on && !done}
                  mark={
                    color === undefined ? undefined : (
                      // A white edge keeps the blue swatch from melting into the picked box.
                      <span className="inline-flex shrink-0 rounded ring-2 ring-white">
                        <Swatch color={color} />
                      </span>
                    )
                  }
                  testId={`rev-item-${item.id}`}
                  data={{ 'data-done': done ? 'true' : undefined }}
                  onClick={() => {
                    onToggle(item.id);
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
