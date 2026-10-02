// One day's bookings on a job (blocked time too) and which ones the picked time overlaps: before a member sends or
// moves a request (ConflictPreview) and on the public request page (the outsider's rows: time, length, type, color).
// A heads-up only: requests are never refused for an overlap.
import type { CalendarRow, IrWhen } from '../../data/inspections.types';
import { formatDay } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { rowChip, typeLabel } from './model';
import { clockLabel, conflictsWith, durationLabel, isDay } from './time';

interface DayListProps {
  when: IrWhen;
  /** That day's rows, or undefined while they load. */
  rows: readonly CalendarRow[] | undefined;
  error: unknown;
  onRetry: () => void;
  testId?: string | undefined;
}

export function DayList({ when, rows, error, onRetry, testId = 'ir-conflicts' }: DayListProps) {
  if (!isDay(when.date)) return null;
  const list = rows ?? [];
  const hits = new Set(conflictsWith({ start_time: when.startTime, duration_kind: when.durationKind, duration_min: when.durationMin }, list));

  return (
    <section className="rounded-md border border-line bg-page px-3 py-2" data-testid={testId} aria-label="That day">
      <p className="text-xs font-medium text-ink-2">{formatDay(when.date, 'EEE, MMM d')}</p>
      {rows === undefined && error === null ? <LoadingState label="Checking the day" /> : null}
      {error !== null ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {rows !== undefined && list.length === 0 ? <p className="text-sm text-ink">Open day.</p> : null}
      {list.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {list.map((r, i) => {
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
