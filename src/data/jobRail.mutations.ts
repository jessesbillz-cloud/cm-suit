// Saves my tools under a job's name (0051 save_job_rail, as the caller, with a version check). The new list shows in the
// same moment (the cache is set before the save is queued, so a box never flickers back); saves run one at a time, each
// with the version the last one returned. A failed save reads the rows again and calls onError.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { RailTool } from '../lib/layout';
import { supabase } from './client';
import { throwIfError } from './errors';
import type { JobRails } from './jobRail.queries';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockJobRail from './mock/jobRail';

const savedSchema = z.object({ version: z.number().int() });

async function writeJobRail(projectId: string, tools: string[] | null, version: number | null): Promise<number> {
  if (isMock()) return mockJobRail.saveJobRail(projectId, tools, version);
  // p_tools null = the recommendation; the generated types call the argument a list, PostgREST passes the null.
  const args = { p_project_id: projectId, p_tools: tools as string[] };
  const row = throwIfError(await supabase.rpc('save_job_rail', version === null ? args : { ...args, p_version: version }));
  return savedSchema.parse(row).version;
}

/** Returns save(projectId, tools): null tools = back to my position's recommendation. */
export function useSaveJobRail(onError: (e: Error) => void) {
  const qc = useQueryClient();
  const mutation = useMutation<number, Error, string>({
    scope: { id: 'user_job_rail' },
    // The cache already holds the list to save; write it with the version the cache holds now.
    mutationFn: async (projectId) => {
      const row = qc.getQueryData<JobRails>(qk.jobRails)?.[projectId];
      if (!row) throw new Error('Your tools are not loaded yet.');
      return writeJobRail(projectId, row.tools, row.version);
    },
    onSuccess: (version, projectId) => {
      qc.setQueryData<JobRails>(qk.jobRails, (all) => {
        const row = all?.[projectId];
        return all && row ? { ...all, [projectId]: { ...row, version } } : all;
      });
    },
    onError: async (e) => {
      onError(e);
      await qc.invalidateQueries({ queryKey: qk.jobRails });
    },
  });
  return (projectId: string, tools: readonly RailTool[] | null) => {
    void qc.cancelQueries({ queryKey: qk.jobRails });
    qc.setQueryData<JobRails>(qk.jobRails, (all) =>
      all ? { ...all, [projectId]: { tools: tools === null ? null : [...tools], version: all[projectId]?.version ?? null } } : all,
    );
    mutation.mutate(projectId);
  };
}
