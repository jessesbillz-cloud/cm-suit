// A company's logo (the official RFI PDF, and since 0110 every server-made PDF and the top bar of the jobs that show the
// company): PNG or JPEG up to 1 MB in the private org-logos bucket at org/<org_id>/logo, recorded by set_org_logo (org
// admins only; the database checks the path, the size and the type). An SVG is turned into a PNG first (lib/svgToPng),
// an image over 1 MB goes through lib/compressPhoto. The preview and the top bar sign through the same module (one
// bucket rule).
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { compressPhoto } from '../lib/compressPhoto';
import { svgToPng } from '../lib/svgToPng';
import { supabase } from './client';
import { DataError, throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockLogo from './mock/orgLogo';

const LOGO_BUCKET = 'org-logos';
const LOGO_MAX_BYTES = 1024 * 1024;

function logoPath(orgId: string): string {
  return `org/${orgId}/logo`;
}

async function prepareLogo(file: File): Promise<Blob> {
  const image = file.type === 'image/svg+xml' ? await svgToPng(file) : file;
  if (image.type !== 'image/png' && image.type !== 'image/jpeg') throw new DataError('PNG, JPEG or SVG only.', '22023', null);
  if (image.size <= LOGO_MAX_BYTES) return image;
  const small = await compressPhoto(image);
  if (small.size > LOGO_MAX_BYTES) throw new DataError('That image is over 1 MB.', '22023', null);
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

/** After a logo change: the preview, the top bar of every job, and the company's version (set_org_logo moved it). */
function logoChanged(qc: QueryClient, orgId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.orgLogo(orgId) }),
    qc.invalidateQueries({ queryKey: qk.jobBrands }),
    qc.invalidateQueries({ queryKey: qk.myOrgs }),
  ]);
}

export function useUploadOrgLogo(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadOrgLogo(orgId, file),
    onSettled: () => logoChanged(qc, orgId),
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
    onSettled: () => logoChanged(qc, orgId),
  });
}

async function fetchOrgLogo(orgId: string): Promise<{ path: string | null; url: string | null }> {
  if (isMock()) return mockLogo.logo(orgId);
  const row: unknown = throwIfError(await supabase.from('orgs').select('logo_path').eq('id', orgId).single());
  const path = z.object({ logo_path: z.string().nullable() }).parse(row).logo_path;
  if (path === null) return { path: null, url: null };
  return { path, url: await signedLogoUrl(path) };
}

/** A fresh 5-minute URL of a logo (the storage policy decides who may read it: 0038, 0110). */
export async function signedLogoUrl(path: string): Promise<string> {
  const signed = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, 300);
  if (signed.error) throw new DataError(signed.error.message, null, signed.error.message);
  return signed.data.signedUrl;
}

/** The logo's path and a fresh short-lived signed URL for the settings preview (nulls when there is none). */
export function useOrgLogo(orgId: string) {
  return useQuery({ queryKey: qk.orgLogo(orgId), queryFn: () => fetchOrgLogo(orgId), staleTime: 240_000 });
}
