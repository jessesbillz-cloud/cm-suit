// My tools under each job's name on the rail (0051): one read for all my jobs. RLS returns only my rows, on jobs I'm on
// now; zod checks what comes back. A job with no row (or tools null) shows my position's recommendation.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockJobRail from './mock/jobRail';

interface JobRailRow {
  /** In my order; null = my position's recommendation. */
  tools: string[] | null;
  /** null until the first save makes the row. */
  version: number | null;
}

/** Job id -> my list there. */
export type JobRails = Record<string, JobRailRow>;

const rowsSchema = z.array(z.object({ project_id: z.string(), tools: z.array(z.string()).nullable(), version: z.number().int() }));

async function fetchJobRails(): Promise<JobRails> {
  const rows = isMock()
    ? await mockJobRail.jobRails()
    : rowsSchema.parse(throwIfError(await supabase.from('user_job_rail').select('project_id, tools, version')));
  return Object.fromEntries(rows.map((r) => [r.project_id, { tools: r.tools, version: r.version }]));
}

export function useJobRails() {
  return useQuery({ queryKey: qk.jobRails, queryFn: fetchJobRails, staleTime: Infinity });
}

/** Job id -> my own list there (null = my recommendation), as lib/jobs railModel takes it. */
export function jobRailChoices(rails: JobRails | undefined): Record<string, string[] | null> {
  return Object.fromEntries(Object.entries(rails ?? {}).map(([id, r]) => [id, r.tools]));
}
