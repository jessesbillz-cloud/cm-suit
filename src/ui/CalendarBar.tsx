// The calendar's top line (the Calendar tool and Inspections, one look): the month (or the week) on the left, then
// previous, Today, next as one joined control.
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from './Icon';

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
      className="flex h-10 w-10 items-center justify-center text-ink-2 hover:bg-page hover:text-ink sm:h-9 sm:w-9"
      onClick={onClick}
    >
      <Icon icon={icon} size={18} />
    </button>
  );
}

interface CalendarBarProps {
  /** "October 2026", or the week's range. */
  title: string;
  /** Test ids: `<prefix>-range`, `-prev`, `-today`, `-next`. */
  testIdPrefix: string;
  /** A short count beside the title (desktop only). */
  meta?: ReactNode | undefined;
  onStep: (dir: 1 | -1) => void;
  onToday: () => void;
}

export function CalendarBar({ title, testIdPrefix, meta, onStep, onToday }: CalendarBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-1.5 sm:px-4">
      <h2 data-testid={`${testIdPrefix}-range`} className="min-w-0 text-base font-semibold tabular-nums text-ink">
        {title}
      </h2>
      {meta ? <span className="hidden text-sm tabular-nums text-ink-2 sm:inline">{meta}</span> : null}
      <div className="ml-auto inline-flex shrink-0 items-stretch divide-x divide-line overflow-hidden rounded-lg border border-line-strong bg-card shadow-control">
        <StepButton
          label="Previous"
          testId={`${testIdPrefix}-prev`}
          icon={ChevronLeft}
          onClick={() => {
            onStep(-1);
          }}
        />
        <button
          type="button"
          data-testid={`${testIdPrefix}-today`}
          className="h-10 px-3.5 text-sm font-medium text-ink hover:bg-page sm:h-9"
          onClick={onToday}
        >
          Today
        </button>
        <StepButton
          label="Next"
          testId={`${testIdPrefix}-next`}
          icon={ChevronRight}
          onClick={() => {
            onStep(1);
          }}
        />
      </div>
    </div>
  );
}
