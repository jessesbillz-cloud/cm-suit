// The request picker's items: one button per item that just says what it is, in rev order under a thin "Rev 3 · Drywall"
// label. Three at most (OSFM: three colors on a sheet); a picked one carries its map color, so the picked buttons are
// the legend. An item passed or N/A on every picked wall is done: shown with a check, not pickable. One already asked
// for, or failed last time, has a small status dot.
import { Check } from 'lucide-react';
import type { MarkupColor } from '../../lib/markup';
import { ChipPick, type Chip } from '../../ui/ChipPick';
import { Icon } from '../../ui/Icon';
import { Swatch } from './map/MarkupBar';
import { GROUP_LABEL } from './RevWalls';
import { MAX_ITEMS, itemState, type ItemState, type RevGroup, type RevPick, type StatusIndex } from './revPick';

interface RevItemsProps {
  groups: readonly RevGroup[];
  index: StatusIndex;
  pick: RevPick;
  /** The carried items' colors. */
  colors: ReadonlyMap<string, MarkupColor>;
  onToggle: (itemId: string) => void;
}

const SAYS: Record<Exclude<ItemState, 'open'>, string> = { done: 'Done', requested: 'Requested', failed: 'Failed' };
const DOT: Record<'requested' | 'failed', string> = { requested: 'var(--status-pending-dot)', failed: 'var(--status-not_approved-dot)' };

function Mark({ state, color }: { state: ItemState; color: MarkupColor | undefined }) {
  if (color !== undefined) {
    // A white edge keeps the blue swatch from melting into the picked button.
    return (
      <span className="inline-flex shrink-0 rounded ring-2 ring-white">
        <Swatch color={color} />
      </span>
    );
  }
  if (state === 'open') return null;
  return (
    <>
      {state === 'done' ? (
        <Icon icon={Check} size={15} className="shrink-0 text-ink-3" />
      ) : (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[state] }} />
      )}
      <span className="sr-only">{SAYS[state]}:</span>
    </>
  );
}

export function RevItems({ groups, index, pick, colors, onToggle }: RevItemsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="rev-items-pick">
      {groups.map((g) => {
        const here = g.items.map((i) => i.id);
        const picked = pick.itemIds.filter((id) => here.includes(id));
        const chips: Chip<string>[] = g.items.map((item) => {
          const state = itemState(index, item.id, pick.areaIds);
          const on = picked.includes(item.id);
          return {
            value: item.id,
            label: item.name,
            mark: <Mark state={state} color={on ? colors.get(item.id) : undefined} />,
            // One that became done while picked can still be dropped.
            done: state === 'done' && !on,
            title: state === 'open' ? undefined : SAYS[state],
          };
        });
        return (
          <div key={g.number} className="flex flex-col gap-1.5">
            <span aria-hidden className={GROUP_LABEL}>
              Rev {g.number} · {g.name}
            </span>
            <ChipPick
              label={`Rev ${String(g.number)} ${g.name}`}
              multiple
              // The three are shared by every rev: this one takes what the others leave.
              max={MAX_ITEMS - (pick.itemIds.length - picked.length)}
              chips={chips}
              picked={picked}
              onChange={(next) => {
                const tapped = here.find((id) => next.includes(id) !== picked.includes(id));
                if (tapped !== undefined) onToggle(tapped);
              }}
              testId="rev-item"
            />
          </div>
        );
      })}
    </div>
  );
}
