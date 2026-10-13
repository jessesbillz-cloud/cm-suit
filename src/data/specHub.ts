// A spec section's page in Files (Jesse, Oct 12: "click a spec section and say show me all the RFIs and submittals
// associated with this"): the RFI tool's RFIs I may see with their Reference line, read straight from rfis under its
// own policy (rfi_may_see), so the page can match each one's section numbers. Voided RFIs stay out.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/specHub';
import { RFI_STATUSES } from './rfis.types';

const rfiRefSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  status: z.enum(RFI_STATUSES),
  title: z.string(),
  refs: z.string(),
  pdf_file_id: z.string().nullable(),
  created_at: z.string(),
});
export type RfiRef = z.infer<typeof rfiRefSchema>;

async function fetchRfiRefs(projectId: string): Promise<RfiRef[]> {
  if (isMock()) return mock.rfiRefs(projectId);
  const rows: unknown = throwIfError(
    await supabase
      .from('rfis')
      .select('id, number, status, title, refs, pdf_file_id, created_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .neq('status', 'void')
      .order('created_at', { ascending: false }),
  );
  return z.array(rfiRefSchema).parse(rows);
}

/** The RFIs I may see on the job with their references, newest first (refreshed with every RFI change). */
export function useRfiRefs(projectId: string) {
  return useQuery({ queryKey: qk.rfisPart(projectId, 'spec_refs'), queryFn: () => fetchRfiRefs(projectId) });
}
