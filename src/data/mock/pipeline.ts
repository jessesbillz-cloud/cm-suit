// bid_pipeline() in the e2e mock: my jobs in a bid stage (fixtures, edits and jobs made in this test) with their counts.
// Like the database, a person without bids.manage (the mock bidder) gets nothing.
import type { PipelineRow } from '../bids.pipeline';
import { PIPELINE_STAGES } from '../../lib/jobs';
import { capability } from './bids';
import { project, projects } from './jobs';
import { pipelineCounts } from './pipelineJobs';

export async function bidPipeline(): Promise<PipelineRow[]> {
  if (!(await capability('bids.manage'))) return [];
  const stages: readonly string[] = PIPELINE_STAGES;
  const mine = (await projects()).filter((p) => stages.includes(p.stage));
  const rows = await Promise.all(
    mine.map(async (p): Promise<PipelineRow> => {
      const row = await project(p.project_id);
      return {
        project_id: p.project_id,
        name: p.name,
        number: row.number,
        org_name: p.org_name,
        stage: p.stage,
        timezone: p.timezone,
        bid_due_at: row.bid_due_at,
        ...pipelineCounts(p.project_id),
      };
    }),
  );
  return rows.sort((a, b) => (a.bid_due_at ?? '9999').localeCompare(b.bid_due_at ?? '9999') || a.name.localeCompare(b.name));
}
