// The ONE progress tracker (Jesse, Oct 1: "look more like the My Daily Reports way ... a slider, not buttons"): MDR's
// status pipeline. Small round dots on a thin line, a short label (and a time) under each. Done: a green dot with a
// check, and the line into the next step turns green once that step is reached. Has it now: a ringed dot with its
// number. Ahead: a grey outline with its number. Failed (not approved, returned): red with a cross. Colors from
// lib/status only. Used by the RFI route strip and the inspection request tracker.
import type { CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import { Icon } from './Icon';

export type StepperState = 'done' | 'current' | 'todo' | 'failed';

interface StepperStep {
  key: string;
  label: string;
  /** A second line under the label, e.g. how long the step held it ("5d"). */
  sub?: string | undefined;
  state: StepperState;
  /** Hover text: who and when. */
  title?: string | undefined;
  /** What kind of step, for tests and styling hooks (data-kind). */
  kind?: string | undefined;
}

interface StepperProps {
  steps: readonly StepperStep[];
  /** sm: the RFI log rows; md: a pane. */
  size?: 'sm' | 'md' | undefined;
  label?: string | undefined;
  testId?: string | undefined;
}

const KEY: Record<StepperState, string> = { done: 'step_done', current: 'step_current', todo: 'step_ahead', failed: 'late' };
const SPOKEN: Record<StepperState, string> = { done: 'done', current: 'now', todo: 'ahead', failed: 'stopped' };

function dotStyle(state: StepperState): CSSProperties {
  const k = KEY[state];
  if (state === 'done' || state === 'failed') {
    return { background: `var(--status-${k}-solid)`, color: `var(--status-${k}-on-solid)`, boxShadow: `inset 0 0 0 2px var(--status-${k}-solid)` };
  }
  return { background: `var(--status-${k}-bg)`, color: `var(--status-${k}-fg)`, boxShadow: `inset 0 0 0 2px var(--status-${k}-dot)` };
}

interface DotProps {
  state: StepperState;
  n: number;
  size: 'sm' | 'md';
}

function Dot({ state, n, size }: DotProps) {
  const px = size === 'sm' ? 'h-[18px] w-[18px] text-[10px]' : 'h-[22px] w-[22px] text-[11px]';
  const icon = size === 'sm' ? 11 : 13;
  return (
    <span className={`relative z-10 flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${px}`} style={dotStyle(state)}>
      {state === 'done' ? <Icon icon={Check} size={icon} /> : null}
      {state === 'failed' ? <Icon icon={X} size={icon} /> : null}
      {state === 'current' || state === 'todo' ? n : null}
    </span>
  );
}

/** The line into step i is colored once step i is reached (done, has it, or failed). */
function lineColor(state: StepperState): string {
  if (state === 'todo') return `var(--status-step_ahead-dot)`;
  return state === 'failed' ? `var(--status-late-dot)` : `var(--status-step_done-solid)`;
}

export function Stepper({ steps, size = 'md', label = 'Progress', testId }: StepperProps) {
  if (steps.length === 0) return null;
  const top = size === 'sm' ? 'top-[9px]' : 'top-[11px]';
  return (
    <ol className="flex w-full min-w-0 items-start" aria-label={label} data-testid={testId}>
      {steps.map((s, i) => {
        const text = s.state === 'current' ? 'font-semibold' : s.state === 'todo' ? 'font-medium' : 'font-semibold';
        const color = `var(--status-${KEY[s.state]}-fg)`;
        return (
          <li
            key={s.key}
            title={s.title}
            data-state={s.state}
            data-kind={s.kind}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
          >
            {i > 0 ? (
              <span aria-hidden="true" className={`absolute right-1/2 h-0.5 w-full -translate-y-1/2 ${top}`} style={{ background: lineColor(s.state) }} />
            ) : null}
            <Dot state={s.state} n={i + 1} size={size} />
            <span className={`break-words px-0.5 leading-[13px] ${size === 'sm' ? 'text-[10.5px]' : 'text-[11.5px]'} ${text}`} style={{ color }}>
              {s.label}
              {s.sub ? <span className="block font-normal tabular-nums opacity-90">{s.sub}</span> : null}
            </span>
            <span className="sr-only">{`, ${SPOKEN[s.state]}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
