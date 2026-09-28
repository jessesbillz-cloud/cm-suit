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
}

export function History({ projectId, requestId, tz }: HistoryProps) {
  const events = useIrEvents(projectId, requestId);
  const people = usePeopleDisplay(projectId);
  const nameOf = (id: string | null) => people.data?.find((p) => p.user_id === id)?.full_name ?? '';

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="History" data-testid="ir-history">
      {events.isPending ? <LoadingState label="Loading history" /> : null}
      {events.isError ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : null}
      {events.data?.length === 0 ? <p className="text-sm text-ink-2">No changes yet.</p> : null}
      {events.data && events.data.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {events.data.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-ink-2">{formatInZone(e.created_at, tz, 'MMM d, h:mm a')}</span>
              <span className="text-ink">{actionLabel(e.action)}</span>
              <span className="text-ink-2">{nameOf(e.actor_id)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
