// Received bids (SPEC §11.4, §11.6), shown only once bids are open: package, bidder, receipt, time, late, version.
import { useBidPackages, useBidSubmissions } from '../../data/bids.queries';
import { usePeopleDisplay } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { BidList } from './BidList';
import { bidderName } from './model';

interface ReceivedViewProps {
  projectId: string;
  tz: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function ReceivedView({ projectId, tz, selectedId, onOpen }: ReceivedViewProps) {
  const subs = useBidSubmissions(projectId, true);
  const packages = useBidPackages(projectId);
  const people = usePeopleDisplay(projectId);

  const code = (id: string) => packages.data?.find((p) => p.id === id)?.code ?? '';
  const company = (memberId: string | null) =>
    memberId === null ? 'Recorded by office' : bidderName(people.data?.find((x) => x.member_id === memberId));

  return (
    <Card padded={false}>
      {subs.isPending ? <LoadingState label="Loading bids" /> : null}
      {subs.isError ? <ErrorState error={subs.error} onRetry={() => void subs.refetch()} /> : null}
      {subs.data?.length === 0 ? <EmptyState title="No bids received." /> : null}
      {subs.data && subs.data.length > 0 ? (
        <BidList
          testId="received"
          selectedId={selectedId}
          onOpen={onOpen}
          rows={subs.data.map((s) => ({
            id: s.id,
            lead: code(s.package_id),
            title: `${company(s.member_id)} · #${String(s.receipt_number)}`,
            chips: (
              <>
                {s.version_no > 1 ? <span className="text-xs text-ink-2">v{s.version_no}</span> : null}
                {s.is_late ? <StatusChip status="postponed" label="Late" /> : null}
              </>
            ),
            meta: formatInZone(s.received_at, tz, 'MMM d h:mm a'),
          }))}
        />
      ) : null}
    </Card>
  );
}
