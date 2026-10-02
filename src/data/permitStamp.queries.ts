// Permit stamp reads (migration 0053): a permit's approved sets (everyone who reads permits) and the job's PDFs the
// official may stamp. Both sit under the permits key, so every permit write refreshes them.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockStamp from './mock/permitStamp';
import { permitApprovedSchema, stampSourceSchema, type PermitApproved, type StampSource } from './permitStamp.types';

async function fetchApproved(permitId: string): Promise<PermitApproved> {
  if (isMock()) return mockStamp.approved(permitId);
  return permitApprovedSchema.parse(throwIfError(await supabase.rpc('permit_approved', { p_permit_id: permitId })));
}

/** The permit's stamped sets, newest first, and whether I may stamp it now ('issue' or 'revise'). */
export function usePermitApproved(permitId: string) {
  return useQuery({ queryKey: qk.permitsPart('approved', permitId), queryFn: () => fetchApproved(permitId) });
}

async function fetchSources(permitId: string): Promise<StampSource[]> {
  if (isMock()) return mockStamp.sources(permitId);
  return z.array(stampSourceSchema).parse(throwIfError(await supabase.rpc('permit_stamp_sources', { p_permit_id: permitId })));
}

/** The job's PDFs I may stamp for this permit, plan folders first (only asked once the stamp flow is open). */
export function useStampSources(permitId: string | null) {
  return useQuery({
    queryKey: qk.permitsPart('stamp-sources', permitId ?? ''),
    queryFn: permitId ? () => fetchSources(permitId) : skipToken,
  });
}
