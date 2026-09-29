// ‹ September 2026 ›: one month at a time, opening on this month (MDR's stepper). Never past this month.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../lib/timesheet';
import { Icon } from '../../ui/Icon';
import { SEGMENT_TRACK } from '../../ui/Segments';
import { currentMonth } from './model';

interface MonthStepperProps {
  month: string;
  onPick: (month: string) => void;
}

const STEP =
  'inline-flex h-7 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-page hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3/50 disabled:hover:bg-transparent';

export function MonthStepper({ month, onPick }: MonthStepperProps) {
  const last = month >= currentMonth();
  return (
    <div className={`${SEGMENT_TRACK} gap-1`} role="group" aria-label="Month">
      <button
        type="button"
        aria-label="Previous month"
        data-testid="month-prev"
        className={STEP}
        onClick={() => {
          onPick(shiftMonth(month, -1));
        }}
      >
        <Icon icon={ChevronLeft} size={16} />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-ink" data-testid="month-label" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        data-testid="month-next"
        className={STEP}
        disabled={last}
        onClick={() => {
          onPick(shiftMonth(month, 1));
        }}
      >
        <Icon icon={ChevronRight} size={16} />
      </button>
    </div>
  );
}
