// The bids tool. Bidders (bids.submit) get their own page; managers (bids.manage) get the sub-views.
// Which one is decided by has_capability, never by role names.
import { useCapability } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { BidderPage } from './BidderPage';
import { ManagerBids } from './ManagerBids';

interface BidsToolProps {
  projectId: string;
  itemId: string | null;
}

export function BidsTool({ projectId, itemId }: BidsToolProps) {
  const submit = useCapability(projectId, 'bids.submit');
  const manage = useCapability(projectId, 'bids.manage');

  if (submit.isPending || manage.isPending) return <LoadingState label="Loading bids" />;
  if (submit.isError) return <ErrorState error={submit.error} onRetry={() => void submit.refetch()} />;
  if (manage.isError) return <ErrorState error={manage.error} onRetry={() => void manage.refetch()} />;
  if (submit.data) return <BidderPage projectId={projectId} />;
  if (manage.data) return <ManagerBids projectId={projectId} itemId={itemId} />;
  return (
    <Card>
      <EmptyState title="No bids for you on this job." />
    </Card>
  );
}
