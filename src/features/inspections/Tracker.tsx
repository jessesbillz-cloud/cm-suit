// Where is my inspection: Submitted → (GC) → Inspector → Result, as MDR's pipeline (ui/Stepper, the one tracker); an
// OFS request goes Submitted → (GC) → Inspector → OFS → Result. Done steps are green checks, the current one is ringed,
// the next ones are grey; a return, postponement or Not approved shows red. The GC step shows only when the job has it
// on or the request is at, or went through, the GC (an OFS request always does while the job has a GC).
import { Stepper } from '../../ui/Stepper';
import type { TrackStep } from './model';

export function Tracker({ steps }: { steps: readonly TrackStep[] }) {
  return <Stepper testId="ir-tracker" steps={steps.map((s) => ({ key: s.key, label: s.label, state: s.state }))} />;
}
