// The rail (0040): my role's recommended tools on each of my jobs, and what needs me per record type (the badges).
// Both run as the caller in the database; zod checks what comes back.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { TypeCount } from '../lib/toolCounts';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockRail from './mock/rail';

const recommendedSchema = z.array(z.object({ project_id: z.string(), tools: z.array(z.string()) }));

async function fetchRecommended(): Promise<Record<string, string[]>> {
  const rows = isMock() ? await mockRail.recommendedTools() : recommendedSchema.parse(throwIfError(await supabase.rpc('my_recommended_tools')));
  return Object.fromEntries(rows.map((r) => [r.project_id, r.tools]));
}

/** Job id -> my recommended rail there (my role's list, minus the job's switched-off tools). One call for all my jobs. */
export function useRecommendedTools() {
  return useQuery({ queryKey: qk.recommendedTools, queryFn: fetchRecommended, staleTime: 5 * 60_000 });
}

const countsSchema = z.array(z.object({ entity_type: z.string().nullable(), n: z.number().int() }));

async function fetchCounts(projectId: string | null): Promise<TypeCount[]> {
  if (isMock()) return mockRail.toolCounts(projectId);
  const args = projectId === null ? {} : { p_project_id: projectId };
  return countsSchema.parse(throwIfError(await supabase.rpc('my_tool_counts', args)));
}

/** What needs me on a job (null = all my jobs), per record type. Refreshed by every task write and once a minute. */
export function useToolCounts(projectId: string | null) {
  return useQuery({ queryKey: qk.toolCounts(projectId), queryFn: () => fetchCounts(projectId), refetchInterval: 60_000 });
}
