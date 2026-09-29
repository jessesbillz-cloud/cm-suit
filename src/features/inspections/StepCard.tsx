// One of the inspector's steps on a request, as a card: its number (a check once done), its name, and its controls.
// The step to do now has an accent edge; steps not reached yet show only their name, greyed.
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { CardState } from './model';

const BUBBLE: Record<CardState, string> = {
  done: 'bg-accent text-white',
  current: 'bg-accent-soft text-accent ring-1 ring-inset ring-accent',
  open: 'bg-page text-ink-2',
  todo: 'bg-page text-ink-3',
};

interface StepCardProps {
  n: number;
  title: string;
  state: CardState;
  /** The step's controls; left out when the step has nothing to do right now. */
  children?: ReactNode | undefined;
}

export function StepCard({ n, title, state, children }: StepCardProps) {
  const todo = state === 'todo';
  const edge = state === 'current' ? 'border-accent/50 ring-[3px] ring-accent/10' : 'border-line';
  return (
    <section aria-label={title} data-state={state} className={`rounded-lg border bg-card ${edge}`}>
      <header className="flex min-h-11 items-center gap-2.5 px-3 py-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${BUBBLE[state]}`}>
          {state === 'done' ? <Icon icon={Check} size={14} /> : n}
        </span>
        <h3 className={`text-sm font-semibold ${todo ? 'text-ink-3' : 'text-ink'}`}>{title}</h3>
      </header>
      {children && !todo ? <div className="border-t border-line px-3 py-3">{children}</div> : null}
    </section>
  );
}
