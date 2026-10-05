// A delivery's history (from the audit log): what happened, who, when, and which fields an edit changed.
import { useDeliveryHistory } from '../../data/deliveries.queries';
import type { HistoryLine } from '../../data/deliveries.types';
import { formatInZone } from '../../lib/dates';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';

const ACTIONS: Record<string, string> = {
  'delivery.create': 'Posted',
  'delivery.update': 'Edited',
  'delivery.delete': 'Deleted',
  'delivery.restore': 'Restored',
  'delivery.attach': 'Photo added',
  'delivery.detach': 'Photo removed',
  'delivery.reattach': 'Photo put back',
};

const FIELDS: Record<string, string> = {
  company: 'company',
  date: 'date',
  time: 'time',
  duration_min: 'duration',
  description: 'description',
  standby: 'standby',
};

function what(line: HistoryLine): string {
  const base = ACTIONS[line.action] ?? line.action;
  const details = line.details;
  if (line.action !== 'delivery.update' || details === null || typeof details !== 'object' || Array.isArray(details)) return base;
  const changes = details['changes'];
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return base;
  const names = Object.keys(changes).map((k) => FIELDS[k] ?? k);
  return names.length > 0 ? `${base} ${names.join(', ')}` : base;
}

interface HistoryListProps {
  projectId: string;
  deliveryId: string;
  tz: string;
}

export function HistoryList({ projectId, deliveryId, tz }: HistoryListProps) {
  const q = useDeliveryHistory(projectId, deliveryId, true);
  if (q.isPending) return <LoadingState label="Loading history" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) return <EmptyState title="No history yet." />;
  return (
    <ol className="flex flex-col gap-1 text-sm" data-testid="delivery-history">
      {q.data.map((h) => (
        <li key={`${h.at}-${h.action}`} className="flex flex-wrap gap-x-2">
          <span className="text-ink">{what(h)}</span>
          <span className="text-ink-2">{h.actor_name}</span>
          <span className="text-ink-3">{formatInZone(h.at, tz, 'MMM d, h:mm a')}</span>
        </li>
      ))}
    </ol>
  );
}
