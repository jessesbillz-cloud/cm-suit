// Blocked time in the day under the calendar: the hours (or all day) and the job. The inspector who can block time
// removes it with one tap: it leaves the calendar at once, and the toast's Undo brings it back (the removal is saved
// when the toast goes). A removal that fails puts the block back and says why.
import { useQueryClient } from '@tanstack/react-query';
import { CalendarOff, X } from 'lucide-react';
import type { CalendarInspection } from '../../data/calendar.types';
import { messageOf } from '../../data/errors';
import { useRemoveBlock } from '../../data/inspections.mutations';
import { qk } from '../../data/keys';
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

/** One job's cached calendar answer (calendar.queries fetchInspections). */
interface CachedJob {
  projectId: string;
  rows: CalendarInspection[];
}

/** The job's calendar answers (calendar.queries useCalendarInspections), every range on screen or cached. */
function monthKey(projectId: string) {
  return qk.inspectionsPartAll(projectId, 'calendar-month');
}

export function BlockRow({ entry, showJob }: { entry: IrEntry; showJob: boolean }) {
  const remove = useRemoveBlock(entry.projectId);
  const qc = useQueryClient();
  const toast = useToast();
  const id = entry.row.id;

  function doRemove(blockId: string) {
    const key = monthKey(entry.projectId);
    const putBack = () => qc.invalidateQueries({ queryKey: key });
    // Off the calendar now (every repeat of a weekly block goes with it); the next answer from the server decides.
    void qc.cancelQueries({ queryKey: key });
    qc.setQueriesData<CachedJob>({ queryKey: key }, (job) =>
      job ? { ...job, rows: job.rows.filter((r) => !(r.is_block && r.id === blockId)) } : job,
    );
    toast.show({
      message: 'Blocked time removed.',
      action: { label: 'Undo', onClick: () => void putBack() },
      onCommit: () => {
        // mutateAsync: this row may be gone by now (another day picked); the error must still show.
        void remove.mutateAsync(blockId).catch((e: unknown) => {
          void putBack();
          toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
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
