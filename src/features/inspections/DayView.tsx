// The inspector's day (SPEC §13.2): every request and blocked time on one day, live. Confirm is one tap from here
// (tap budget §7.9: 2), on the requests I decide: never on an OFS request for the inspector (he sends it on from the
// request), always for the deputy, whose day is the OFS requests sent to OFS. Removing blocked time is undoable.
import { Plus } from 'lucide-react';
import { useConfirmIr } from '../../data/inspections.decide';
import { useRemoveBlock } from '../../data/inspections.mutations';
import { useIrCalendar } from '../../data/inspections.queries';
import type { CalendarRow } from '../../data/inspections.types';
import { messageOf } from '../../data/errors';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { DayNav } from './DayNav';
import { decidesRequest, routesOnly } from './model';
import { QueueRow } from './QueueRow';
import { addDaysTo } from './time';

interface DayViewProps {
  projectId: string;
  /** What I hold of the two rights that decide requests. */
  can: { decide: boolean; ofsDecide: boolean };
  day: string;
  today: string;
  selectedId: string | null;
  onDay: (day: string) => void;
  onOpen: (id: string) => void;
  /** Present when I may request: the empty day offers it. */
  onRequest?: (() => void) | undefined;
}

export function DayView({ projectId, can, day, today, selectedId, onDay, onOpen, onRequest }: DayViewProps) {
  const cal = useIrCalendar(projectId, day, day);
  const confirm = useConfirmIr();
  const removeBlock = useRemoveBlock(projectId);
  const toast = useToast();
  const requests = cal.data?.filter((r) => !r.is_block).length ?? 0;

  function doConfirm(row: CalendarRow) {
    if (row.id === null || row.version === null) return;
    confirm.mutate(
      { row: { id: row.id, version: row.version, project_id: projectId }, note: null },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `IR ${String(row.number)} not confirmed: ${messageOf(e)}` });
        },
      },
    );
  }

  function doRemove(row: CalendarRow) {
    const id = row.id;
    if (id === null) return;
    toast.show({
      message: 'Blocked time removed.',
      action: { label: 'Undo', onClick: () => undefined },
      onCommit: () => {
        removeBlock.mutate(id, {
          onError: (e) => {
            toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
          },
        });
      },
    });
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <DayNav
          label={formatDay(day, day === today ? "'Today', MMM d" : 'EEE, MMM d')}
          onPrev={() => {
            onDay(addDaysTo(day, -1));
          }}
          onNext={() => {
            onDay(addDaysTo(day, 1));
          }}
          onToday={
            day === today
              ? undefined
              : () => {
                  onDay(today);
                }
          }
        />
        {requests > 0 ? (
          <span className="text-sm tabular-nums text-ink-2">{requests === 1 ? '1 request' : `${String(requests)} requests`}</span>
        ) : null}
      </header>
      {cal.isPending ? <LoadingState label="Loading the day" /> : null}
      {cal.isError ? <ErrorState error={cal.error} onRetry={() => void cal.refetch()} /> : null}
      {cal.data?.length === 0 ? (
        <EmptyState
          icon={TOOL_META.inspections.icon}
          title="Nothing on this day."
          action={
            onRequest ? (
              <Button variant="primary" icon={Plus} onClick={onRequest}>
                Request an inspection
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {cal.data && cal.data.length > 0 ? (
        <ul className="divide-y divide-line" data-testid="ir-queue">
          {cal.data.map((r, i) => (
            <QueueRow
              key={r.id ?? `row-${String(i)}`}
              row={r}
              selected={r.id !== null && r.id === selectedId}
              ofsDecide={can.ofsDecide}
              canConfirm={decidesRequest(r, can) && !routesOnly(r)}
              confirming={confirm.isPending && confirm.variables.row.id === r.id}
              onOpen={onOpen}
              onConfirm={doConfirm}
              onRemoveBlock={doRemove}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
