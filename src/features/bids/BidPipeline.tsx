// Bids on "All my jobs" (Jesse, Sep 28): the funnel of stages on top (each one a filter; Prospect and Bidding at
// first), then every job I run bids on, open bids first and bid due soonest, re-sortable. A row opens that job's Bids.
// Phone: the funnel is a row of chips and the list is one column.
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useBidPipeline } from '../../data/bids.pipeline';
import { useMyOrgs } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { pipelineLine, shownRows, stageCounts } from './pipeline';
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
    <Button variant="primary" icon={Plus} data-testid="pipeline-new" onClick={onClick}>
      New prospect
    </Button>
  );
}

interface FrameProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

/** The page: header (count line, New prospect, the funnel), then the list's card. */
function PipelineFrame({ meta, actions, below, children }: FrameProps) {
  return (
    <div className="flex flex-col" data-testid="bid-pipeline">
      <PageHeader title={TOOL_META.bids.label} icon={TOOL_META.bids.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

export function BidPipeline({ isPhone, onOpenJob }: BidPipelineProps) {
  const pipeline = useBidPipeline();
  const orgs = useMyOrgs();
  const nav = usePipelineNav();
  // Anyone in a company can make a job (the projects insert policy); no company, no button.
  const newProspect = (orgs.data?.length ?? 0) > 0 ? <NewProspect onClick={nav.newProspect} /> : undefined;

  if (pipeline.isPending || pipeline.isError) {
    return (
      <PipelineFrame>
        <Card padded={false}>
          {pipeline.isError ? <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} /> : <LoadingState label="Loading bids" />}
        </Card>
      </PipelineFrame>
    );
  }
  if (pipeline.data.length === 0) {
    return (
      <PipelineFrame>
        <Card>
          <EmptyState title="No bids yet." icon={TOOL_META.bids.icon} action={newProspect} />
        </Card>
      </PipelineFrame>
    );
  }

  const rows = shownRows(pipeline.data, nav.stages, nav.sort);
  const title = (
    <span>
      Jobs <span className="font-normal tabular-nums text-ink-3">{rows.length}</span>
    </span>
  );

  return (
    <PipelineFrame
      meta={pipelineLine(pipeline.data)}
      actions={newProspect}
      below={<PipelineFunnel counts={stageCounts(pipeline.data)} shown={nav.stages} onToggle={nav.toggle} isPhone={isPhone} />}
    >
      <Card title={title} actions={isPhone ? <PipelineSortPicker sort={nav.sort} onSort={nav.sortBy} /> : undefined} padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="No jobs in these stages." icon={TOOL_META.bids.icon} />
        ) : isPhone ? (
          <PipelineList rows={rows} onOpen={onOpenJob} />
        ) : (
          <PipelineTable rows={rows} sort={nav.sort} onSort={nav.sortBy} onOpen={onOpenJob} />
        )}
      </Card>
    </PipelineFrame>
  );
}
