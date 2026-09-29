// The calendar's Prev / Today / Next in its page header (Month / Week is ui/Segments beside it).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '../../ui/Icon';

interface StepProps {
  label: string;
  testId: string;
  icon: typeof ChevronLeft;
  onClick: () => void;
}

function StepButton({ label, testId, icon, onClick }: StepProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      className="flex h-9 w-9 items-center justify-center text-ink-2 hover:bg-page hover:text-ink"
      onClick={onClick}
    >
      <Icon icon={icon} size={18} />
    </button>
  );
}

interface DayStepperProps {
  onStep: (dir: 1 | -1) => void;
  onToday: () => void;
}

/** One joined control: previous, Today, next. */
export function DayStepper({ onStep, onToday }: DayStepperProps) {
  return (
    <div className="inline-flex items-stretch divide-x divide-line overflow-hidden rounded-lg border border-line-strong bg-card shadow-control">
      <StepButton
        label="Previous"
        testId="cal-prev"
        icon={ChevronLeft}
        onClick={() => {
          onStep(-1);
        }}
      />
      <button type="button" data-testid="cal-today" className="h-9 px-3.5 text-sm font-medium text-ink hover:bg-page" onClick={onToday}>
        Today
      </button>
      <StepButton
        label="Next"
        testId="cal-next"
        icon={ChevronRight}
        onClick={() => {
          onStep(1);
        }}
      />
    </div>
  );
}
