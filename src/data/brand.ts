// A company's letterhead and the brand a job shows (migration 0110).
//   Letterhead: org_letterheads (anyone who may read the company's brand), written by set_org_letterhead (the company's
//   admins, with a version check; the same values again are a no-op). Saved as I go, one field at a time, one save at a
//   time per company (mutation scope), each reading the version the last one left in the cache.
//   Brand: job_brand (the company the job shows and its logo's path) with a fresh signed URL of the logo, for the top
//   bar. job_brand_choices and set_job_brand (project.manage) for Settings > Job.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/orgBrand';
import { signedLogoUrl } from './org.mutations';
import type { BrandChoice, JobBrand, Letterhead, LetterheadField } from './brand.types';

const letterheadRow = z
  .object({
    version: z.number().int(),
    print_name: z.string().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    website: z.string().nullable(),
  })
  .nullable();

async function fetchLetterhead(orgId: string): Promise<Letterhead> {
  if (isMock()) return mock.letterhead(orgId);
  const raw: unknown = throwIfErrorMaybe(
    await supabase.from('org_letterheads').select('version, print_name, address, phone, website').eq('org_id', orgId).maybeSingle(),
  );
  const row = letterheadRow.parse(raw);
  return {
    version: row?.version ?? 0,
    print_name: row?.print_name ?? '',
    address: row?.address ?? '',
    phone: row?.phone ?? '',
    website: row?.website ?? '',
  };
}

export function useOrgLetterhead(orgId: string) {
  return useQuery({ queryKey: qk.orgLetterhead(orgId), queryFn: () => fetchLetterhead(orgId) });
}

async function saveLetterhead(orgId: string, current: Letterhead, field: LetterheadField, value: string): Promise<Letterhead> {
  const next = { print_name: current.print_name, address: current.address, phone: current.phone, website: current.website, [field]: value };
  if (isMock()) return mock.saveLetterhead(orgId, next, current.version);
  const row = throwIfError(
    await supabase.rpc('set_org_letterhead', {
      p_org_id: orgId,
      p_version: current.version,
      p_print_name: next.print_name,
      p_address: next.address,
      p_phone: next.phone,
      p_website: next.website,
    }),
  );
  return {
    version: row.version,
    print_name: row.print_name ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    website: row.website ?? '',
  };
}

export function useSaveOrgLetterhead(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `letterhead:${orgId}` },
    mutationFn: async (v: { field: LetterheadField; value: string }) => {
      const current = qc.getQueryData<Letterhead>(qk.orgLetterhead(orgId));
      if (!current) throw new Error('This company has not loaded yet.');
      return saveLetterhead(orgId, current, v.field, v.value);
    },
    onSuccess: (row) => {
      qc.setQueryData(qk.orgLetterhead(orgId), row);
    },
  });
}

async function fetchJobBrand(projectId: string): Promise<JobBrand | null> {
  if (isMock()) return mock.jobBrand(projectId);
  const row = throwIfError(await supabase.rpc('job_brand', { p_project_id: projectId }))[0];
  if (!row) return null;
  return { orgId: row.org_id, name: row.name, logoUrl: row.logo_path ? await signedLogoUrl(row.logo_path) : null };
}

/** The company the job shows and its logo; null for a job I can't see. The signed URL lives 5 minutes. */
export function useJobBrand(projectId: string | null) {
  return useQuery({
    queryKey: qk.jobBrand(projectId ?? ''),
    queryFn: projectId ? () => fetchJobBrand(projectId) : skipToken,
    staleTime: 240_000,
  });
}

/** The companies the job's manager may show (asked only for a manager: the database refuses anyone else). */
export function useJobBrandChoices(projectId: string) {
  return useQuery({
    queryKey: qk.jobBrandChoices(projectId),
    queryFn: async (): Promise<BrandChoice[]> =>
      isMock() ? mock.choices(projectId) : throwIfError(await supabase.rpc('job_brand_choices', { p_project_id: projectId })),
  });
}

export function useSetJobBrand(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string): Promise<string> =>
      isMock()
        ? mock.setJobBrand(projectId, orgId)
        : throwIfError(await supabase.rpc('set_job_brand', { p_project_id: projectId, p_org_id: orgId })),
    // The job's row moved a version (Settings > Job saves on it next).
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.jobBrand(projectId) }),
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      ]),
  });
}
