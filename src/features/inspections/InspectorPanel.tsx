// The steps of whoever decides one request (the inspector; the deputy on an OFS request sent to OFS), each small,
// redoable and silent unless noted: Confirm, Attendance, Approved / Not approved (wall by wall on an OFS request with
// walls), Generate IR, Send results; then Move and Postpone, and the helper (never on an OFS request: it is the
// deputy's alone). Each step is a card; the one to do now stands out. The database checks every one. Signing a passed
// OFS request makes its map again, with the signature on it.
import { useState } from 'react';
import { CalendarClock, PauseCircle } from 'lucide-react';
import type { IrRequest } from '../../data/inspections.types';
import type { IrRevItem } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { AttendanceStep } from './AttendanceStep';
import { ConfirmStep } from './ConfirmStep';
import { HelperStep } from './HelperStep';
import { useSignedMap } from './MapActions';
import { WITH_GC, inspectorSteps, ownsSteps } from './model';
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
  /** An OFS request's walls and items (null for any other request). */
  revs: readonly IrRevItem[] | null;
  /** Off on an OFS request: it has no helper. */
  helper?: boolean | undefined;
}

export function InspectorPanel({ row, me, jobName, revs, helper = true }: InspectorPanelProps) {
  const [moving, setMoving] = useState(false);
  const [postponing, setPostponing] = useState(false);
  const signedMap = useSignedMap();
  if (WITH_GC.includes(row.status)) return null;
  const owner = ownsSteps(row, me);
  if (!owner && !helper) return null;
  const afterSign =
    revs !== null && row.result === 'approved'
      ? () => {
          signedMap(row.id);
        }
      : undefined;
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
            <ResultStep row={row} revs={revs} />
          </StepCard>
          <StepCard n={4} title="IR PDF" state={steps.pdf}>
            <PdfStep row={row} jobName={jobName} afterSign={afterSign} />
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
      {helper ? <HelperStep row={row} me={me} owner={owner} /> : null}
    </section>
  );
}
