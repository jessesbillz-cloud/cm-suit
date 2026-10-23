// The home's cards above the activity (All my jobs is the to-do list): each a box with its heading and count, each
// only for someone whose role on some job works it (home/useHomeScope, capabilities only). For review leads for whoever
// reviews for OFS, then Inspections today for whoever inspects or requests; today's reports for whoever writes dailies;
// Needs you for everyone; RFIs waiting and open bids for the management side.
import { useRfiWaiting } from '../../../data/rfis.queries';
import { Card } from '../../../ui/Card';
import { ErrorState } from '../../../ui/States';
import { NeedsYou } from '../NeedsYou';
import { TodayReports } from '../TodayReports';
import { BidsOpen } from './BidsOpen';
import { ForReviewCard } from './ForReviewCard';
import { InspectionsToday } from './InspectionsToday';
import { RfisWaitingCard } from './RfisWaitingCard';
import { useHomeScope } from './useHomeScope';

export function HomeCards() {
  const scope = useHomeScope();
  const waiting = useRfiWaiting();
  const inspections = scope.inspections ?? [];
  // An RFI still waiting on someone shows even if my role there changed since.
  const rfis = (scope.rfis?.length ?? 0) > 0 || (waiting.data?.length ?? 0) > 0;
  const bids = (scope.bids?.length ?? 0) > 0;
  const pair = rfis || bids;

  return (
    <>
      {scope.error ? (
        <Card padded={false}>
          <ErrorState error={scope.error} title="Your home did not load." onRetry={scope.refetch} />
        </Card>
      ) : null}
      {(scope.review?.length ?? 0) > 0 ? <ForReviewCard /> : null}
      {inspections.length > 0 ? <InspectionsToday jobs={inspections} ofsJobs={scope.ofs ?? []} /> : null}
      <TodayReports />
      <div className={`grid items-start gap-4 ${pair ? 'xl:grid-cols-2' : ''}`}>
        <NeedsYou projectId={null} withRfis={false} />
        {rfis ? <RfisWaitingCard /> : null}
        {bids ? <BidsOpen /> : null}
      </div>
    </>
  );
}
