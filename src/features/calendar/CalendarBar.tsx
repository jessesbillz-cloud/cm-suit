// The calendar's controls in its page header: Prev / Today / Next on the right, Week / Day / Month under the title.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { CAL_VIEWS, VIEW_LABELS, type CalView } from './model';

interface ViewSwitchProps {
  current: CalView;
  onPick: (v: CalView) => void;
}

export function ViewSwitch({ current, onPick }: ViewSwitchProps) {
  return (
    <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-lg border border-line bg-card p-0.5 shadow-control">
      {CAL_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === current}
          data-testid={`cal-view-${v}`}
          className={`h-8 rounded-md px-3.5 text-sm ${v === current ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
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
