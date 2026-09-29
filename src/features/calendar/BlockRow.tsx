// Blocked time in the day under the calendar: the hours (or all day) and the job. The inspector who can block time
// removes it with one tap; the toast's Undo keeps it (the removal happens when the toast goes).
import { CalendarOff, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRemoveBlock } from '../../data/inspections.mutations';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { clockLabel, minutesOf } from '../inspections/time';
import type { IrEntry } from './entries';

function hours(entry: IrEntry): string {
  const { start_time: start, duration_min: length } = entry.row;
  if (start === null || length === null) return 'All day';
  const end = minutesOf(start) + length;
  const hhmm = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  return `${clockLabel(start)} – ${clockLabel(hhmm)}`;
}

export function BlockRow({ entry, showJob }: { entry: IrEntry; showJob: boolean }) {
  const remove = useRemoveBlock(entry.projectId);
  const toast = useToast();
  const id = entry.row.id;

  function doRemove(blockId: string) {
    toast.show({
      message: 'Blocked time removed.',
      action: { label: 'Undo', onClick: () => undefined },
      onCommit: () => {
        remove.mutate(blockId, {
          onError: (e) => {
            toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
          },
        });
      },
    });
  }

  return (
    <div
      data-testid="cal-block"
      className="flex min-h-[52px] items-center gap-3 rounded-lg border border-l-4 border-line bg-card-head px-3.5 py-2"
      style={{ borderLeftColor: 'var(--status-blocked-dot)' }}
    >
      <Icon icon={CalendarOff} size={16} className="shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium tabular-nums text-ink">{hours(entry)}</p>
        {showJob ? <p className="break-words text-[13px] text-ink-2">{entry.projectName}</p> : null}
      </div>
      {id !== null ? (
        <Button
          size="sm"
          variant="quiet"
          icon={X}
          className="h-10 w-10 sm:h-8 sm:w-8"
          aria-label="Remove blocked time"
          title="Remove blocked time"
          onClick={() => {
            doRemove(id);
          }}
        />
      ) : null}
    </div>
  );
}
