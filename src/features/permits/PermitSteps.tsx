// A permit's tracker (Jesse, Sep 30: who had it and how long, never a "days open" column), the ONE tracker (ui/Stepper):
// the ten stages in order, green checks behind, a ring on where it is now, grey ahead, red where it was rejected or
// cancelled, and the days it sat at each stage under the dot (the job's clock, from the server). Three layouts: one row
// (the log on a wide screen), two rows of five (a narrow column: the right column, a phone), or dots and days only
// (the log on a phone, where the row's first line names the stage).
import type { PermitStep } from '../../data/permits.types';
import { Stepper } from '../../ui/Stepper';
import { ROW_PLACES, stepCell } from './model';

interface PermitStepsProps {
  steps: readonly PermitStep[];
  timeZone: string;
  size: 'sm' | 'md';
  layout: 'one' | 'split' | 'dots';
  testId?: string | undefined;
}

export function PermitSteps({ steps, timeZone, size, layout, testId = 'permit-steps' }: PermitStepsProps) {
  const cells = steps.map((s) => stepCell(s, timeZone, layout !== 'dots'));
  if (layout !== 'split') return <Stepper label="Stages" size={size} testId={testId} steps={cells} />;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <Stepper label="Stages 1 to 5" size={size} steps={cells.slice(0, ROW_PLACES)} />
      <Stepper label="Stages 6 to 10" size={size} steps={cells.slice(ROW_PLACES)} start={ROW_PLACES + 1} />
    </div>
  );
}
