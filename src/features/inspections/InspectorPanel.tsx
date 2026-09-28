// The inspector's steps on one request, each small, redoable and silent unless noted: Confirm, Attendance,
// Approved / Not approved, Generate IR, Send results, Postpone, Move, Helper. The database checks every one.
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';
import { AttendanceStep } from './AttendanceStep';
import { ConfirmStep } from './ConfirmStep';
import { HelperStep } from './HelperStep';
import { MoveForm } from './MoveForm';
import { PdfStep } from './PdfStep';
import { PostponeStep } from './PostponeStep';
import { ResultStep } from './ResultStep';
import { SendStep } from './SendStep';

interface InspectorPanelProps {
  row: IrRequest;
  me: string;
  jobName: string;
}

const WITH_GC = ['gc_review', 'returned', 'withdrawn'];

export function InspectorPanel({ row, me, jobName }: InspectorPanelProps) {
  const [moving, setMoving] = useState(false);
  if (WITH_GC.includes(row.status)) return null;
  const owner = row.owner_id === null || row.owner_id === me;
  const movable = row.status !== 'complete' && row.result === null;

  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line pt-4" aria-label="Inspector" data-testid="ir-inspector">
      {owner ? (
        <>
          <ConfirmStep row={row} />
          <AttendanceStep row={row} />
          <ResultStep row={row} />
          <PdfStep row={row} jobName={jobName} />
          <SendStep row={row} />
          <div className="flex flex-wrap gap-2">
            {movable ? (
              <Button
                size="sm"
                icon={CalendarClock}
                onClick={() => {
                  setMoving(!moving);
                }}
              >
                Move
              </Button>
            ) : null}
          </div>
          {moving && movable ? (
            <MoveForm
              row={row}
              onDone={() => {
                setMoving(false);
              }}
            />
          ) : null}
          <PostponeStep row={row} />
        </>
      ) : null}
      <HelperStep row={row} me={me} owner={owner} />
    </section>
  );
}
