// A company's logo (the official RFI PDF carries the job company's logo): PNG or JPEG up to 2 MB in the private
// org-logos bucket at org/<org_id>/logo, recorded by set_org_logo (org admins only; the database checks the path).
// An image over 2 MB goes through lib/compressPhoto first. The preview reads through the same module (one bucket rule).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { compressPhoto } from '../lib/compressPhoto';
import { supabase } from './client';
import { DataError, throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockLogo from './mock/orgLogo';

const LOGO_BUCKET = 'org-logos';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function logoPath(orgId: string): string {
  return `org/${orgId}/logo`;
}

async function prepareLogo(file: File): Promise<Blob> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new DataError('PNG or JPEG only.', '22023', null);
  if (file.size <= LOGO_MAX_BYTES) return file;
  const small = await compressPhoto(file);
  if (small.size > LOGO_MAX_BYTES) throw new DataError('That image is over 2 MB.', '22023', null);
  return small;
}

async function setLogoPath(orgId: string, path: string | null): Promise<void> {
  // p_path null removes the logo; the generated types call the argument required, PostgREST passes the null through.
  throwIfError(await supabase.rpc('set_org_logo', { p_org_id: orgId, p_path: path as string }));
}

/** Uploads (or replaces) the logo and records it on the company. */
async function uploadOrgLogo(orgId: string, file: File): Promise<void> {
  const blob = await prepareLogo(file);
  if (isMock()) {
    await mockLogo.setLogo(orgId, blob);
    return;
  }
  const path = logoPath(orgId);
  const res = await supabase.storage.from(LOGO_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type });
  if (res.error) throw new DataError(res.error.message, null, res.error.message);
  await setLogoPath(orgId, path);
}

export function useUploadOrgLogo(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadOrgLogo(orgId, file),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.orgLogo(orgId) }),
  });
}

export function useRemoveOrgLogo(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (isMock()) {
        await mockLogo.setLogo(orgId, null);
        return;
      }
      await setLogoPath(orgId, null);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.orgLogo(orgId) }),
  });
}

async function fetchOrgLogo(orgId: string): Promise<{ path: string | null; url: string | null }> {
  if (isMock()) return mockLogo.logo(orgId);
  const row: unknown = throwIfError(await supabase.from('orgs').select('logo_path').eq('id', orgId).single());
  const path = z.object({ logo_path: z.string().nullable() }).parse(row).logo_path;
  if (path === null) return { path: null, url: null };
  const signed = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, 300);
  if (signed.error) throw new DataError(signed.error.message, null, signed.error.message);
  return { path, url: signed.data.signedUrl };
}

/** The logo's path and a fresh short-lived signed URL for the settings preview (nulls when there is none). */
export function useOrgLogo(orgId: string) {
  return useQuery({ queryKey: qk.orgLogo(orgId), queryFn: () => fetchOrgLogo(orgId), staleTime: 240_000 });
}
