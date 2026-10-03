// The request picker's items: the list's revs in order, each with its items. A picked item shows its map color (the
// legend); three at most. An item passed or N/A on every picked wall is done and can't be picked; one already asked
// for, or failed last time, says so.
import { useId } from 'react';
import { Check } from 'lucide-react';
import type { MarkupColor } from '../../lib/markup';
import { FIELD_LABEL } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { Swatch } from './map/MarkupBar';
import { MAX_ITEMS, isDone, itemNeed, type ItemNeed, type RevGroup, type RevPick, type StatusIndex } from './revPick';

interface RevItemsProps {
  groups: readonly RevGroup[];
  index: StatusIndex;
  pick: RevPick;
  /** The carried items' colors. */
  colors: ReadonlyMap<string, MarkupColor>;
  onToggle: (itemId: string) => void;
}

function Mark({ color, picked, done }: { color: MarkupColor | undefined; picked: boolean; done: boolean }) {
  if (done) {
    return (
      <span aria-hidden className="flex h-5 w-7 shrink-0 items-center justify-center text-ink-3">
        <Icon icon={Check} size={16} />
      </span>
    );
  }
  if (picked && color !== undefined) return <Swatch color={color} />;
  return <span aria-hidden className={`h-5 w-7 shrink-0 rounded border ${picked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-card'}`} />;
}

function Need({ need, done }: { need: ItemNeed; done: boolean }) {
  if (done) return <span className="shrink-0 text-xs text-ink-3">Done</span>;
  if (need.requested > 0) return <StatusChip status="pending" label="Requested" />;
  if (need.failed > 0) return <StatusChip status="not_approved" label="Failed" />;
  if (need.done > 0) {
    return (
      <span className="shrink-0 text-xs tabular-nums text-ink-2">
        {need.done} of {need.done + need.open} done
      </span>
    );
  }
  return null;
}

export function RevItems({ groups, index, pick, colors, onToggle }: RevItemsProps) {
  const full = pick.itemIds.length >= MAX_ITEMS;
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span id={labelId} className={FIELD_LABEL}>
          Items
        </span>
        <span className={`text-xs tabular-nums ${full ? 'font-medium text-ink' : 'text-ink-2'}`} data-testid="rev-items-count">
          {pick.itemIds.length} of {MAX_ITEMS}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-control">
        {groups.map((g) => (
          <div key={g.number} role="group" aria-label={`Rev ${String(g.number)} ${g.name}`} className="border-t border-line first:border-t-0">
            <p className="bg-card-head px-3 py-1.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">
              Rev {g.number} · {g.name}
            </p>
            <ul>
              {g.items.map((item) => {
                const picked = pick.itemIds.includes(item.id);
                const need = itemNeed(index, item.id, pick.areaIds);
                const done = isDone(need);
                const off = done || (full && !picked);
                return (
                  <li key={item.id} className="border-t border-line">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={picked}
                      disabled={off}
                      data-testid={`rev-item-${item.id}`}
                      data-done={done || undefined}
                      onClick={() => {
                        onToggle(item.id);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm text-ink hover:bg-page/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
                    >
                      <Mark color={colors.get(item.id)} picked={picked} done={done} />
                      <span className={`min-w-0 flex-1 break-words ${picked ? 'font-medium' : ''}`}>{item.name}</span>
                      <Need need={need} done={done} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
