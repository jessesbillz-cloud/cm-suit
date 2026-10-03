// Requirements reads (migration 0063): the job's register (requirements_list runs as me: RLS shows drafts to managers
// only, and a file's name only when I may see the file) and the spec book's sections found from the page text. Every
// query of a job sits under qk.requirements(job), so one refresh after any write.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requirements';
import { requirementSchema, specSectionSchema, type Requirement, type SpecSection } from './requirements.types';

async function fetchRequirements(projectId: string): Promise<Requirement[]> {
  if (isMock()) return mock.list(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('requirements_list', { p_project_id: projectId }));
  return z.array(requirementSchema).parse(rows);
}

/** The job's requirements, by due date (undated last), drafts included when I manage them. */
export function useRequirements(projectId: string) {
  return useQuery({ queryKey: qk.requirementsPart(projectId, 'list'), queryFn: () => fetchRequirements(projectId) });
}

async function fetchSections(projectId: string): Promise<SpecSection[]> {
  if (isMock()) return mock.sections(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('requirements_spec_sections', { p_project_id: projectId }));
  return z.array(specSectionSchema).parse(rows);
}

/** The sections of the spec books in the job's Specs folders (asked only when the read form is open). */
export function useSpecSections(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.requirementsPart(projectId, 'sections'),
    queryFn: enabled ? () => fetchSections(projectId) : skipToken,
    staleTime: 60_000,
  });
}
