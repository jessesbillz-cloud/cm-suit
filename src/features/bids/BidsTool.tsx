// The bids tool. Bidders (bids.submit) get their own page; managers (bids.manage) get the sub-views.
// Which one is decided by has_capability, never by role names.
import { useCapability } from '../../data/queries';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { BidderPage } from './BidderPage';
import { ManagerBids } from './ManagerBids';

interface BidsToolProps {
  projectId: string;
  itemId: string | null;
}

export function BidsTool({ projectId, itemId }: BidsToolProps) {
  const submit = useCapability(projectId, 'bids.submit');
  const manage = useCapability(projectId, 'bids.manage');

  const pending = submit.isPending || manage.isPending;
  const failed = submit.isError ? submit : manage.isError ? manage : null;
  if (!pending && failed === null) {
    if (submit.data) return <BidderPage projectId={projectId} />;
    if (manage.data) return <ManagerBids projectId={projectId} itemId={itemId} />;
  }
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={TOOL_META.bids.label} icon={TOOL_META.bids.icon} />
      <Card padded={false}>
        {pending ? <LoadingState label="Loading bids" /> : null}
        {!pending && failed ? <ErrorState error={failed.error} onRetry={() => void failed.refetch()} /> : null}
        {!pending && failed === null ? <EmptyState title="No bids for you on this job." icon={TOOL_META.bids.icon} /> : null}
      </Card>
    </div>
  );
}
