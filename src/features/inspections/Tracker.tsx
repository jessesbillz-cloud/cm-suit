// Where is my inspection: Submitted → (GC) → Inspector → Result. The GC step shows only when the job has it on.
import { Check, CircleDot, Circle, X } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { StepState, TrackStep } from './model';

const ICONS = { done: Check, current: CircleDot, todo: Circle, failed: X } as const;
const COLORS: Record<StepState, string> = {
  done: 'text-ink',
  current: 'text-accent font-medium',
  todo: 'text-ink-3',
  failed: 'text-danger font-medium',
};

export function Tracker({ steps }: { steps: readonly TrackStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Progress" data-testid="ir-tracker">
      {steps.map((s, i) => (
        <li key={s.key} className={`flex items-center gap-1 ${COLORS[s.state]}`} data-state={s.state}>
          {i > 0 ? <span className="mr-1 text-ink-3">→</span> : null}
          <Icon icon={ICONS[s.state]} size={14} />
          {s.label}
        </li>
      ))}
    </ol>
  );
}
