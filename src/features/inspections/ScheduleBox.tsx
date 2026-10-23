// Where an OFS request's time stands (0108), one clear box on the request and on the designated person's start page:
// Asked for <day time>, Confirmed for <day time>, or OFS proposed <day time> with Accept (one tap; Move asks again).
import { Check } from 'lucide-react';
import { useAcceptTime } from '../../data/inspections.schedule';
import type { IrRef } from '../../data/inspections.mutations';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { requesterLine, schedChip, type SchedState } from './ofsSchedule';

interface ScheduleBoxProps {
  /** The request, for Accept's version check. */
  row: IrRef;
  state: SchedState;
  date: string;
  time: string | null;
  note: string | null;
  /** I may accept a time OFS picked: the requester, the designated person or the inspector. */
  canAccept: boolean;
}

export function ScheduleBox({ row, state, date, time, note, canAccept }: ScheduleBoxProps) {
  const accept = useAcceptTime();
  const toast = useToast();
  const line = requesterLine(state, date, time);
  if (line === null) return null;
  const chip = state === 'proposed' ? { status: 'assigned' as const, label: 'New time' } : schedChip(state);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-card px-3 py-2.5" data-testid="ofs-sched" data-state={state}>
      <StatusChip status={chip.status} label={chip.label} />
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink wrap-anywhere" data-testid="ofs-sched-line">
        {line}
        {note ? <span className="block text-xs font-normal text-ink-2">{note}</span> : null}
      </span>
      {state === 'proposed' && canAccept ? (
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          loading={accept.isPending}
          data-testid="ofs-sched-accept"
          onClick={() => {
            accept.mutate(row, {
              onError: (e) => {
                toast.show({ tone: 'error', message: `Not accepted: ${messageOf(e)}` });
              },
            });
          }}
        >
          Accept
        </Button>
      ) : null}
    </div>
  );
}
