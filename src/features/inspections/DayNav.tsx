// Previous / next around a label ("Oct 5 – 11", "Tue, Oct 6") as one bar, and back to today when it's out of view.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

interface DayNavProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Shown when the range doesn't hold today. */
  onToday?: (() => void) | undefined;
}

const STEP = 'flex h-11 w-11 items-center justify-center text-ink-2 hover:bg-page hover:text-ink sm:h-9 sm:w-9';

export function DayNav({ label, onPrev, onNext, onToday }: DayNavProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-stretch overflow-hidden rounded-md border border-line-strong bg-card shadow-control">
        <button type="button" aria-label="Previous" className={STEP} onClick={onPrev}>
          <Icon icon={ChevronLeft} size={18} />
        </button>
        <span
          className="flex min-w-36 items-center justify-center border-x border-line px-3 text-sm font-semibold tabular-nums text-ink"
          data-testid="ir-range"
        >
          {label}
        </span>
        <button type="button" aria-label="Next" className={STEP} onClick={onNext}>
          <Icon icon={ChevronRight} size={18} />
        </button>
      </div>
      {onToday ? (
        <Button className="h-11 sm:h-9" onClick={onToday}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
