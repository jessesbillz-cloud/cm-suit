// The inspector's day (SPEC §13.2): every request and blocked time on one day, live. Confirm is one tap from here
// (tap budget §7.9: 2). Removing blocked time is undoable.
import { useConfirmIr } from '../../data/inspections.decide';
import { useRemoveBlock } from '../../data/inspections.mutations';
import { useIrCalendar } from '../../data/inspections.queries';
import type { CalendarRow } from '../../data/inspections.types';
import { messageOf } from '../../data/errors';
import { formatDay } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { DayNav } from './DayNav';
import { QueueRow } from './QueueRow';
import { addDaysTo } from './time';

interface DayViewProps {
  projectId: string;
  day: string;
  today: string;
  selectedId: string | null;
  onDay: (day: string) => void;
  onOpen: (id: string) => void;
}

export function DayView({ projectId, day, today, selectedId, onDay, onOpen }: DayViewProps) {
  const cal = useIrCalendar(projectId, day, day);
  const confirm = useConfirmIr();
  const removeBlock = useRemoveBlock(projectId);
  const toast = useToast();

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
    <Card padded={false}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <DayNav
          label={formatDay(day, 'EEE, MMM d')}
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
      </header>
      {cal.isPending ? <LoadingState label="Loading the day" /> : null}
      {cal.isError ? <ErrorState error={cal.error} onRetry={() => void cal.refetch()} /> : null}
      {cal.data?.length === 0 ? <EmptyState title="Nothing on this day." /> : null}
      {cal.data && cal.data.length > 0 ? (
        <ul className="divide-y divide-line" data-testid="ir-queue">
          {cal.data.map((r, i) => (
            <QueueRow
              key={r.id ?? `row-${String(i)}`}
              row={r}
              selected={r.id !== null && r.id === selectedId}
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
