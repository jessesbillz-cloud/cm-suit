// Before sending: that day's bookings on this job, everyone's (anonymized by the database), and which ones the picked
// time overlaps. A heads-up only: requests are never refused. MDR's preview could not see this job's own bookings.
import { useIrCalendar } from '../../data/inspections.queries';
import type { IrWhen } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { rowChip, typeLabel } from './model';
import { clockLabel, conflictsWith, durationLabel, isDay } from './time';

interface ConflictPreviewProps {
  projectId: string;
  when: IrWhen;
  /** When moving a request: itself is not a conflict. */
  ownId: string | null;
}

export function ConflictPreview({ projectId, when, ownId }: ConflictPreviewProps) {
  const day = useIrCalendar(projectId, when.date, when.date);
  const rows = (day.data ?? []).filter((r) => r.id === null || r.id !== ownId);
  const hits = new Set(conflictsWith({ start_time: when.startTime, duration_kind: when.durationKind, duration_min: when.durationMin }, rows));
  if (!isDay(when.date)) return null;

  return (
    <section className="rounded-md border border-line bg-page px-3 py-2" data-testid="ir-conflicts" aria-label="That day">
      <p className="text-xs font-medium text-ink-2">{formatDay(when.date, 'EEE, MMM d')}</p>
      {day.isPending ? <LoadingState label="Checking the day" /> : null}
      {day.isError ? <ErrorState error={day.error} onRetry={() => void day.refetch()} /> : null}
      {day.data && rows.length === 0 ? <p className="text-sm text-ink">Open day.</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((r, i) => {
            const chip = rowChip(r);
            const clash = hits.has(r);
            return (
              <li key={r.id ?? `b-${String(i)}`} className={`flex items-center gap-2 text-sm ${clash ? 'text-danger' : 'text-ink'}`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--status-${chip.status}-dot)` }} />
                <span className="tabular-nums">{r.duration_kind === 'all_day' ? 'All day' : clockLabel(r.start_time)}</span>
                <span className="text-ink-2">
                  {r.duration_kind === 'timed' ? durationLabel('timed', r.duration_min) : ''} {r.is_block ? 'Blocked' : typeLabel(r.kind, r.special_kind)}
                  {r.mine ? ' · yours' : ''}
                  {r.status_key === 'postponed' ? ' · postponed' : ''}
                </span>
                {clash ? <span className="ml-auto text-xs font-medium">Overlaps</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
