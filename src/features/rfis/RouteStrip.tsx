// The RFI's route as a tracker (Jesse, Sep 30 / Oct 1): one dot per step of the RFI's own route, from the person who
// wrote it to the answer, MDR's pipeline look (ui/Stepper). Done: a green check with who and how long it sat there
// ("PE", "1d"). Has it now: a ring with who and how long so far ("Architect", "5d"; "You" when it's mine). Ahead: a
// grey outline. Days come from the server (the job's clock).
import type { RfiProgressRow, RouteState } from '../../data/rfis.types';
import { Stepper, type StepperState } from '../../ui/Stepper';
import { cellText, cellTitle } from './progress';

interface RouteStripProps {
  steps: readonly RfiProgressRow[];
  timeZone: string;
  /** The step that has it now is mine: it says "You". */
  mine?: boolean | undefined;
  /** sm in the log rows, md in the pane. */
  size: 'sm' | 'md';
  testId?: string | undefined;
}

const STATE: Record<RouteState, StepperState> = { done: 'done', current: 'current', next: 'todo' };

export function RouteStrip({ steps, timeZone, mine = false, size, testId = 'rfi-strip' }: RouteStripProps) {
  return (
    <Stepper
      label="Route"
      size={size}
      testId={testId}
      steps={steps.map((s) => {
        const { label, time } = cellText(s, mine);
        return { key: String(s.position), kind: s.kind, label, sub: time, state: STATE[s.state], title: cellTitle(s, timeZone) };
      })}
    />
  );
}
