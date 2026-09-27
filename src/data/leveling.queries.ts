// Leveling read hooks (SPEC §11.6): one board query and one flags query per job, never per row. Both RPCs return
// nothing for anyone without bids.manage or while bids are sealed, and no money for anyone without bids.view_pricing.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { flagRowSchema, levelingRowSchema, type FlagRow, type LevelingRow } from './bids.types';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import * as mockLeveling from './mock/leveling';
import { isMock } from './mock';

async function fetchBoard(projectId: string): Promise<LevelingRow[]> {
  if (isMock()) return mockLeveling.board(projectId);
  const raw: unknown = throwIfError(await supabase.rpc('bid_leveling_board', { p_project_id: projectId }));
  return z.array(levelingRowSchema).parse(raw);
}

async function fetchFlags(projectId: string): Promise<FlagRow[]> {
  if (isMock()) return mockLeveling.flags(projectId);
  const raw: unknown = throwIfError(await supabase.rpc('bid_flags', { p_project_id: projectId }));
  return z.array(flagRowSchema).parse(raw);
}

/** Every submission of the job with its state, bidder and (for pricing callers) money. Asked once bids are open. */
export function useLevelingBoard(projectId: string, open: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'leveling_board'),
    queryFn: open ? () => fetchBoard(projectId) : skipToken,
  });
}

export function useBidFlags(projectId: string, open: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'flags'),
    queryFn: open ? () => fetchFlags(projectId) : skipToken,
  });
}
