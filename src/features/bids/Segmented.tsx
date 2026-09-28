// The compact sub-view switch at the top of the bids tool. One row of short labels; no tab bar. On a phone the row
// scrolls sideways. A view can carry a count of what's missing there (e.g. Forms), in lib/status's pending colors.
import { BIDS_VIEWS, VIEW_LABELS, type BidsView } from './model';

interface SegmentedProps {
  current: BidsView;
  /** Views not offered right now (e.g. Received while bids are sealed). */
  hidden: readonly BidsView[];
  /** A number shown on a view's label when above zero. */
  counts?: Partial<Record<BidsView, number>> | undefined;
  onPick: (v: BidsView) => void;
}

/** On a phone the row scrolls sideways: keep the open view in sight (the row only, never the page). */
function keepInSight(el: HTMLElement | null) {
  const row = el?.parentElement;
  if (!el || !row) return;
  const tab = el.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  if (tab.left < box.left) row.scrollLeft -= box.left - tab.left;
  else if (tab.right > box.right) row.scrollLeft += tab.right - box.right;
}

export function Segmented({ current, hidden, counts, onPick }: SegmentedProps) {
  return (
    <div role="tablist" aria-label="Bids" className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-card p-0.5">
      {BIDS_VIEWS.filter((v) => !hidden.includes(v)).map((v) => {
        const count = counts?.[v] ?? 0;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === current}
            data-testid={`bids-view-${v}`}
            ref={v === current ? keepInSight : undefined}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 text-sm ${v === current ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
            onClick={() => {
              onPick(v);
            }}
          >
            {VIEW_LABELS[v]}
            {count > 0 ? (
              <span
                data-testid={`bids-view-${v}-count`}
                aria-label={`${String(count)} missing`}
                className="rounded-full px-1.5 text-xs font-medium tabular-nums"
                style={{ color: 'var(--status-pending-fg)', background: 'var(--status-pending-bg)' }}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
