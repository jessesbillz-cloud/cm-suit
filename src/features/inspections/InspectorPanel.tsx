// The inspector's steps on one request, each small, redoable and silent unless noted: Confirm, Attendance,
// Approved / Not approved, Generate IR, Send results; then Move and Postpone, and the helper. Each step is a card; the
// one to do now stands out. The database checks every one.
import { useState } from 'react';
import { CalendarClock, PauseCircle } from 'lucide-react';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { AttendanceStep } from './AttendanceStep';
import { ConfirmStep } from './ConfirmStep';
import { HelperStep } from './HelperStep';
import { inspectorSteps } from './model';
import { MoveForm } from './MoveForm';
import { PdfStep } from './PdfStep';
import { PostponeForm, canPostpone } from './PostponeForm';
import { ResultStep } from './ResultStep';
import { SendStep } from './SendStep';
import { StepCard } from './StepCard';

interface InspectorPanelProps {
  row: IrRequest;
  me: string;
  jobName: string;
}

const WITH_GC = ['gc_review', 'returned', 'withdrawn'];

export function InspectorPanel({ row, me, jobName }: InspectorPanelProps) {
  const [moving, setMoving] = useState(false);
  const [postponing, setPostponing] = useState(false);
  if (WITH_GC.includes(row.status)) return null;
  const owner = row.owner_id === null || row.owner_id === me;
  const movable = row.status !== 'complete' && row.result === null;
  const postponable = canPostpone(row.status);
  const steps = inspectorSteps(row);
  // Confirm has controls while waiting, and "Back to pending" until there is a result.
  const confirmControls = steps.confirm === 'current' || (row.status === 'confirmed' && row.result === null);

  return (
    <section className="flex flex-col gap-2" aria-label="Inspector" data-testid="ir-inspector">
      {owner ? (
        <>
          <StepCard n={1} title="Confirm" state={steps.confirm}>
            {confirmControls ? <ConfirmStep row={row} /> : null}
          </StepCard>
          <StepCard n={2} title="Attendance" state={steps.attendance}>
            <AttendanceStep row={row} />
          </StepCard>
          <StepCard n={3} title="Result" state={steps.result}>
            <ResultStep row={row} />
          </StepCard>
          <StepCard n={4} title="IR PDF" state={steps.pdf}>
            <PdfStep row={row} jobName={jobName} />
          </StepCard>
          <StepCard n={5} title="Send results" state={steps.send}>
            <SendStep row={row} />
          </StepCard>
          {movable || postponable ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {movable ? (
                <Button
                  icon={CalendarClock}
                  aria-pressed={moving}
                  onClick={() => {
                    setMoving(!moving);
                  }}
                >
                  Move
                </Button>
              ) : null}
              {postponable ? (
                <Button
                  icon={PauseCircle}
                  aria-pressed={postponing}
                  data-testid="ir-postpone-open"
                  onClick={() => {
                    setPostponing(!postponing);
                  }}
                >
                  Postpone
                </Button>
              ) : null}
            </div>
          ) : null}
          {moving && movable ? (
            <MoveForm
              row={row}
              onDone={() => {
                setMoving(false);
              }}
            />
          ) : null}
          {postponing && postponable ? (
            <PostponeForm
              row={row}
              onDone={() => {
                setPostponing(false);
              }}
            />
          ) : null}
        </>
      ) : null}
      <HelperStep row={row} me={me} owner={owner} />
    </section>
  );
}
