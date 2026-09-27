// A sub's history across the org's jobs (invited, bidding, not bidding, bid in, awarded), newest first.
import { useSubHistory } from '../../data/subs.queries';
import { formatInZone } from '../../lib/dates';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { historyChip } from './subs';

interface SubHistoryProps {
  orgId: string;
  subId: string;
  tz: string;
}

export function SubHistory({ orgId, subId, tz }: SubHistoryProps) {
  const history = useSubHistory(orgId, subId);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-ink-2">History</h3>
      {history.isPending ? <LoadingState label="Loading history" /> : null}
      {history.isError ? <ErrorState error={history.error} onRetry={() => void history.refetch()} /> : null}
      {history.data?.length === 0 ? <p className="text-sm text-ink-3">None yet.</p> : null}
      {history.data && history.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5" data-testid="sub-history">
          {history.data.map((h) => {
            const chip = historyChip(h.kind);
            return (
              <li key={h.id} className="flex items-start gap-2 text-sm">
                <StatusChip status={chip.status} label={chip.label} />
                <span className="min-w-0 flex-1 break-words text-ink">{h.job ?? 'Another job'}</span>
                <span className="shrink-0 text-xs text-ink-2">{formatInZone(h.at, tz, 'MMM d, yyyy')}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
