// Permit reads (migration 0052): a job's log (or, with no job, my whole caseload), the trackers, one permit in full, and
// who can be assigned on a job. The database decides what comes back (permits.read); zod checks it.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPermits from './mock/permits';
import {
  permitDetailSchema,
  permitListRowSchema,
  permitPersonSchema,
  permitStepSchema,
  type PermitDetail,
  type PermitListRow,
  type PermitPerson,
  type PermitStep,
} from './permits.types';

async function fetchList(projectId: string | null): Promise<PermitListRow[]> {
  if (isMock()) return mockPermits.list(projectId);
  const rows: unknown =
    projectId === null
      ? throwIfError(await supabase.rpc('my_permits'))
      : throwIfError(await supabase.rpc('permit_list', { p_project_id: projectId }));
  return z.array(permitListRowSchema).parse(rows);
}

/** The job's permits I may read; null = every job of mine (the official's caseload). */
export function usePermitList(projectId: string | null) {
  return useQuery({ queryKey: qk.permitsPart('list', projectId ?? 'all'), queryFn: () => fetchList(projectId) });
}

async function fetchProgress(projectId: string | null): Promise<PermitStep[]> {
  if (isMock()) return mockPermits.progress(projectId, null);
  const args = projectId === null ? {} : { p_project_id: projectId };
  return z.array(permitStepSchema).parse(throwIfError(await supabase.rpc('permit_progress', args)));
}

/** Every permit's tracker on the job (null = all my jobs), with the days at each stage. */
export function usePermitProgress(projectId: string | null) {
  return useQuery({ queryKey: qk.permitsPart('progress', projectId ?? 'all'), queryFn: () => fetchProgress(projectId) });
}

async function fetchDetail(permitId: string): Promise<PermitDetail> {
  if (isMock()) return mockPermits.detail(permitId);
  return permitDetailSchema.parse(throwIfError(await supabase.rpc('permit_detail', { p_permit_id: permitId })));
}

/** One permit with its tracker, what I may do, its reviews and comments, history and inspections. */
export function usePermitDetail(permitId: string) {
  return useQuery({ queryKey: qk.permitsPart('detail', permitId), queryFn: () => fetchDetail(permitId) });
}

async function fetchPeople(projectId: string): Promise<PermitPerson[]> {
  if (isMock()) return mockPermits.people(projectId);
  return z.array(permitPersonSchema).parse(throwIfError(await supabase.rpc('permit_people', { p_project_id: projectId })));
}

/** Who may be assigned a permit on the job: the members who handle permits there. */
export function usePermitPeople(projectId: string | null) {
  return useQuery({
    queryKey: qk.permitsPart('people', projectId ?? ''),
    queryFn: projectId ? () => fetchPeople(projectId) : skipToken,
    staleTime: 60_000,
  });
}
