// A request's history (behind one link): every change, who and when, newest first.
import { useIrEvents } from '../../data/inspections.queries';
import { usePeopleDisplay } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { actionLabel } from './model';

interface HistoryProps {
  projectId: string;
  requestId: string;
  tz: string;
  /** Sent through the public link (0055): the visitor's typed name stands for a step with no member behind it. */
  visitor?: string | null | undefined;
}

export function History({ projectId, requestId, tz, visitor = null }: HistoryProps) {
  const events = useIrEvents(projectId, requestId);
  const people = usePeopleDisplay(projectId);
  const nameOf = (id: string | null) => (id === null ? (visitor ?? '') : (people.data?.find((p) => p.user_id === id)?.full_name ?? ''));

  return (
    <section className="rounded-lg border border-line px-3 py-2.5" aria-label="History" data-testid="ir-history">
      {events.isPending ? <LoadingState label="Loading history" /> : null}
      {events.isError ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : null}
      {people.isError ? <ErrorState title="Names did not load." error={people.error} onRetry={() => void people.refetch()} className="m-0" /> : null}
      {events.data?.length === 0 ? <p className="text-sm text-ink-2">No changes yet.</p> : null}
      {events.data && events.data.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {events.data.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5">
              <span className="w-28 shrink-0 tabular-nums text-ink-3">{formatInZone(e.created_at, tz, 'MMM d, h:mm a')}</span>
              <span className="font-medium text-ink">{actionLabel(e.action)}</span>
              <span className="text-ink-2">{nameOf(e.actor_id)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
