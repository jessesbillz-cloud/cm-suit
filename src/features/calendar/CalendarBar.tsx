// The calendar's top row: Week / Day / Month (the bids Segmented style), Prev / Today / Next, and what's showing.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { CAL_VIEWS, VIEW_LABELS, type CalView } from './model';

interface ViewSwitchProps {
  current: CalView;
  onPick: (v: CalView) => void;
}

function ViewSwitch({ current, onPick }: ViewSwitchProps) {
  return (
    <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-md border border-line bg-card p-0.5">
      {CAL_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === current}
          data-testid={`cal-view-${v}`}
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

interface CalendarBarProps {
  view: CalView;
  label: string;
  /** Phone: the week list only, so no view switch. */
  showViews: boolean;
  onView: (v: CalView) => void;
  onStep: (dir: 1 | -1) => void;
  onToday: () => void;
}

export function CalendarBar({ view, label, showViews, onView, onStep, onToday }: CalendarBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showViews ? <ViewSwitch current={view} onPick={onView} /> : null}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous"
          data-testid="cal-prev"
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-card hover:text-ink"
          onClick={() => {
            onStep(-1);
          }}
        >
          <Icon icon={ChevronLeft} size={18} />
        </button>
        <Button size="sm" onClick={onToday} data-testid="cal-today">
          Today
        </Button>
        <button
          type="button"
          aria-label="Next"
          data-testid="cal-next"
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-card hover:text-ink"
          onClick={() => {
            onStep(1);
          }}
        >
          <Icon icon={ChevronRight} size={18} />
        </button>
      </div>
      <h2 data-testid="cal-range" className="text-sm font-semibold text-ink">
        {label}
      </h2>
    </div>
  );
}
