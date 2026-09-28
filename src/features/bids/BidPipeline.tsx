// Bids on "All my jobs" (Jesse, Sep 28): the funnel of stages on top (each one a filter; Prospect and Bidding at
// first), then every job I run bids on, open bids first and bid due soonest, re-sortable. A row opens that job's Bids.
// Phone: the funnel is a row of chips and the list is one column.
import { Plus } from 'lucide-react';
import { useBidPipeline } from '../../data/bids.pipeline';
import { useMyOrgs } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { shownRows, stageCounts } from './pipeline';
import { PipelineFunnel } from './PipelineFunnel';
import { PipelineList, PipelineSortPicker } from './PipelineList';
import { PipelineTable } from './PipelineTable';
import { usePipelineNav } from './usePipelineNav';

interface BidPipelineProps {
  isPhone: boolean;
  /** Opens the job's Bids tool (and remembers the job as recent). */
  onOpenJob: (projectId: string) => void;
}

function NewProspect({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="primary" icon={Plus} data-testid="pipeline-new" onClick={onClick}>
      New prospect
    </Button>
  );
}

export function BidPipeline({ isPhone, onOpenJob }: BidPipelineProps) {
  const pipeline = useBidPipeline();
  const orgs = useMyOrgs();
  const nav = usePipelineNav();
  // Anyone in a company can make a job (the projects insert policy); no company, no button.
  const newProspect = (orgs.data?.length ?? 0) > 0 ? <NewProspect onClick={nav.newProspect} /> : undefined;

  if (pipeline.isPending) {
    return (
      <Card>
        <LoadingState label="Loading bids" />
      </Card>
    );
  }
  if (pipeline.isError) {
    return (
      <Card>
        <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />
      </Card>
    );
  }
  if (pipeline.data.length === 0) {
    return (
      <Card>
        <EmptyState title="No bids yet." action={newProspect} />
      </Card>
    );
  }

  const rows = shownRows(pipeline.data, nav.stages, nav.sort);
  const title = (
    <span>
      Jobs <span className="font-normal tabular-nums text-ink-3">{rows.length}</span>
    </span>
  );
  const actions = (
    <>
      {isPhone ? <PipelineSortPicker sort={nav.sort} onSort={nav.sortBy} /> : null}
      {newProspect}
    </>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3" data-testid="bid-pipeline">
      <PipelineFunnel counts={stageCounts(pipeline.data)} shown={nav.stages} onToggle={nav.toggle} isPhone={isPhone} />
      <Card title={title} actions={actions} padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="No jobs in these stages." />
        ) : isPhone ? (
          <PipelineList rows={rows} onOpen={onOpenJob} />
        ) : (
          <PipelineTable rows={rows} sort={nav.sort} onSort={nav.sortBy} onOpen={onOpenJob} />
        )}
      </Card>
    </div>
  );
}
