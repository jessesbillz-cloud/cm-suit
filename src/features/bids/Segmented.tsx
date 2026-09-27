// The compact sub-view switch at the top of the bids tool. One row of short labels; no tab bar.
import { BIDS_VIEWS, VIEW_LABELS, type BidsView } from './model';

interface SegmentedProps {
  current: BidsView;
  /** Views not offered right now (e.g. Received while bids are sealed). */
  hidden: readonly BidsView[];
  onPick: (v: BidsView) => void;
}

export function Segmented({ current, hidden, onPick }: SegmentedProps) {
  return (
    <div role="tablist" aria-label="Bids" className="inline-flex rounded-md border border-line bg-card p-0.5">
      {BIDS_VIEWS.filter((v) => !hidden.includes(v)).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === current}
          data-testid={`bids-view-${v}`}
          className={`h-8 rounded px-3 text-sm ${v === current ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
          onClick={() => {
            onPick(v);
          }}
        >
          {VIEW_LABELS[v]}
        </button>
      ))}
    </div>
  );
}
