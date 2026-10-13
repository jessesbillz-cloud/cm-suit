// The home's open bids, only for someone who runs bids on a job (bids.manage; bid_pipeline decides the jobs): the
// prospects and bids out, due soonest first, each with its bid time. A tap opens that job's Bids.
import { useMemo } from 'react';
import { useOpenTarget } from '../../../app/frame/useOpenTarget';
import { useBidPipeline } from '../../../data/bids.pipeline';
import { stageLabel } from '../../../lib/jobs';
import { Card } from '../../../ui/Card';
import { ErrorState, LoadingState } from '../../../ui/States';
import { TOOL_META } from '../../../ui/tools';
import { parseSort, parseStages, shownRows } from '../../bids/pipeline';
import { DueCell } from '../../bids/PipelineCells';
import { NeedsRow } from '../NeedsRow';
import { CountTitle } from './CountTitle';

export function BidsOpen() {
  const pipeline = useBidPipeline();
  const openTarget = useOpenTarget();
  // The pipeline's own default: the open stages, bid due soonest.
  const rows = useMemo(() => shownRows(pipeline.data ?? [], parseStages(undefined), parseSort(undefined)), [pipeline.data]);

  return (
    <div data-testid="home-bids">
      <Card title={<CountTitle label="Open bids" count={pipeline.isSuccess ? rows.length : null} testId="home-bids-count" />} padded={false}>
        {pipeline.isPending ? <LoadingState label="Loading bids" /> : null}
        {pipeline.isError ? <ErrorState error={pipeline.error} title="Bids did not load." onRetry={() => void pipeline.refetch()} /> : null}
        {pipeline.isSuccess && rows.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">No open bids.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <NeedsRow
                key={r.project_id}
                testId="home-bid"
                icon={TOOL_META.bids.icon}
                title={r.name}
                meta={stageLabel(r.stage)}
                end={<DueCell row={r} inline />}
                onOpen={() => {
                  openTarget(r.project_id, { tool: 'bids', itemId: null });
                }}
              />
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
