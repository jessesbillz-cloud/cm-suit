// Where is my inspection: Submitted → (GC) → Inspector → Result, as a stepper. Done steps are filled, the current one
// is ringed, the next ones are grey; a return, postponement or Not approved shows red. The GC step shows only when the
// job has it on.
import { Check, X } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { StepState, TrackStep } from './model';

const DOT: Record<StepState, string> = {
  done: 'bg-accent text-white',
  current: 'bg-card text-accent ring-2 ring-inset ring-accent',
  todo: 'bg-card text-ink-3 ring-1 ring-inset ring-line-strong',
  failed: 'bg-danger text-white',
};

const LABEL: Record<StepState, string> = {
  done: 'text-ink',
  current: 'text-accent font-semibold',
  todo: 'text-ink-3',
  failed: 'text-danger font-semibold',
};

function Dot({ state }: { state: StepState }) {
  return (
    <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${DOT[state]}`}>
      {state === 'done' ? <Icon icon={Check} size={15} /> : null}
      {state === 'failed' ? <Icon icon={X} size={15} /> : null}
      {state === 'current' ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
    </span>
  );
}

export function Tracker({ steps }: { steps: readonly TrackStep[] }) {
  return (
    <ol className="flex items-start" aria-label="Progress" data-testid="ir-tracker">
      {steps.map((s, i) => {
        // The line into a step is colored once that step is reached.
        const reached = s.state !== 'todo';
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center" data-state={s.state}>
            {i > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${reached ? (s.state === 'failed' ? 'bg-danger/60' : 'bg-accent') : 'bg-line-strong'}`}
              />
            ) : null}
            <Dot state={s.state} />
            <span className={`break-words px-1 text-xs leading-4 ${LABEL[s.state]}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
