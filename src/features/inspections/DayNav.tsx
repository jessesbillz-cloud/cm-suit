// Previous / next and back to today, around a label ("Oct 5 – 11", "Tue, Oct 6").
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button';

interface DayNavProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Shown when the range doesn't hold today. */
  onToday?: (() => void) | undefined;
}

export function DayNav({ label, onPrev, onNext, onToday }: DayNavProps) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="quiet" icon={ChevronLeft} aria-label="Previous" onClick={onPrev} />
      <span className="min-w-32 text-center text-sm font-medium text-ink" data-testid="ir-range">
        {label}
      </span>
      <Button size="sm" variant="quiet" icon={ChevronRight} aria-label="Next" onClick={onNext} />
      {onToday ? (
        <Button size="sm" variant="quiet" onClick={onToday}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
