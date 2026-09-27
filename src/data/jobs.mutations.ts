// Company and job writes: create (RPCs that make the id and return the first row on a repeat) and autosaves.
// Autosaves carry a version check (CLAUDE.md rule 7) and run one at a time per row (mutation scope), each reading the
// version the previous save left in the cache, so quick edits never trip over each other.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { qk } from './keys';
import * as mock from './mock/jobs';
import { isMock } from './mock';
import { PROJECT_COLS, withSettings, type ProjectWithSettings } from './queries';
import type { MyOrg, NewJobInput, OrgPatch, ProjectPatch, ProjectRow } from './types';

async function createOrg(name: string, kind: string): Promise<string> {
  if (isMock()) return mock.createOrg(name, kind);
  return throwIfError(await supabase.rpc('create_org', { p_name: name, p_kind: kind }));
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; kind: string }) => createOrg(v.name, v.kind),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myOrgs }),
  });
}

async function createJob(v: NewJobInput): Promise<string> {
  if (isMock()) return mock.createProject(v);
  return throwIfError(
    await supabase.rpc('create_project', {
      p_org_id: v.orgId,
      p_name: v.name,
      p_stage: v.stage,
      p_number: v.number,
      p_address: v.address,
      p_prevailing_wage: v.prevailingWage,
      p_job_type: v.jobType,
      ...(v.bidDueAt ? { p_bid_due_at: v.bidDueAt } : {}),
    }),
  );
}

/** Creates the job; the caller navigates once the job list includes it. */
export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myProjects }),
  });
}

async function updateProject(projectId: string, patch: ProjectPatch, version: number): Promise<ProjectRow> {
  if (isMock()) return mock.saveProject(projectId, patch, version);
  const rows = throwIfError(
    await supabase.from('projects').update(patch).eq('id', projectId).eq('version', version).select(PROJECT_COLS),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return row;
}

export function useSaveProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `project:${projectId}` },
    mutationFn: async (patch: ProjectPatch) => {
      const current = qc.getQueryData<ProjectWithSettings>(qk.project(projectId));
      if (!current) throw new Error('This job has not loaded yet.');
      return updateProject(projectId, patch, current.version);
    },
    onSuccess: async (row) => {
      qc.setQueryData(qk.project(projectId), withSettings(row));
      // Name, number, stage and modules show in the job picker and the rail.
      await qc.invalidateQueries({ queryKey: qk.myProjects });
    },
  });
}

async function updateOrg(orgId: string, patch: OrgPatch, version: number): Promise<number> {
  if (isMock()) return mock.saveOrg(orgId, patch, version);
  const rows = throwIfError(await supabase.from('orgs').update(patch).eq('id', orgId).eq('version', version).select('version'));
  const row = rows[0];
  if (!row) throw conflictError();
  return row.version;
}

export function useSaveOrg(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `org:${orgId}` },
    mutationFn: async (patch: OrgPatch) => {
      const current = qc.getQueryData<MyOrg[]>(qk.myOrgs)?.find((o) => o.org_id === orgId);
      if (!current) throw new Error('This company has not loaded yet.');
      const version = await updateOrg(orgId, patch, current.version);
      return { ...current, ...patch, version };
    },
    onSuccess: async (org) => {
      qc.setQueryData<MyOrg[]>(qk.myOrgs, (list) => list?.map((o) => (o.org_id === org.org_id ? org : o)));
      // The company name shows next to each job in the picker.
      await qc.invalidateQueries({ queryKey: qk.myProjects });
    },
  });
}
