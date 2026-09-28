// The bids pipeline across all my jobs (Jesse, Sep 28): one row per job I run bids on, in a bid stage, counts only.
// bid_pipeline() decides which jobs (bids.manage on each); the screen never reasons about roles.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import type { Database } from './database.types';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPipeline from './mock/pipeline';

type PipelineRaw = Database['public']['Functions']['bid_pipeline']['Returns'][number];

/** The generator types RETURNS TABLE columns as non-null; the job number and the bid due time are often not set. */
export type PipelineRow = Omit<PipelineRaw, 'number' | 'bid_due_at'> & { number: string | null; bid_due_at: string | null };

export function useBidPipeline() {
  return useQuery({
    queryKey: qk.bidPipeline,
    queryFn: async (): Promise<PipelineRow[]> =>
      isMock() ? mockPipeline.bidPipeline() : throwIfError(await supabase.rpc('bid_pipeline')),
  });
}
