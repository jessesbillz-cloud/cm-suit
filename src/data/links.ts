// Public entry points (SPEC §6.4): permanent access links and share links. Both end in an email code.
import { useCallback } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { acceptInvites } from './auth';
import { supabase } from './client';
import { throwIfError } from './errors';
import { FunctionError, callFunction } from './functions';
import { qk } from './keys';

const accessSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
  email_masked: z.string(),
  project_name: z.string(),
  /** Requested from the lead: lets the page go straight to the job after sign-in. Optional until it ships. */
  project_id: z.string().optional(),
});
export type AccessLinkInfo = z.infer<typeof accessSchema>;

/** Resolves an access link. A revoked or expired link rejects with FunctionError status 404. */
async function openAccessLink(linkId: string, token: string): Promise<AccessLinkInfo> {
  return callFunction('access', { link_id: linkId, token }, accessSchema);
}

export function useAccessLink(linkId: string, token: string | null) {
  return useQuery({
    queryKey: ['access_link', linkId, token ?? ''] as const,
    queryFn: token ? () => openAccessLink(linkId, token) : skipToken,
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * After signing in from an access link: bind the invite, refresh my jobs, and return the job to open
 * (by id when the endpoint sends it, else by name; null = let the home screen choose).
 */
export function useEnterProject() {
  const qc = useQueryClient();
  return useCallback(
    async (info: AccessLinkInfo): Promise<string | null> => {
      await acceptInvites();
      await qc.invalidateQueries({ queryKey: qk.myProjects });
      const projects = await qc.fetchQuery({
        queryKey: qk.myProjects,
        queryFn: async () => throwIfError(await supabase.rpc('my_projects')),
      });
      const hit = projects.find((p) => p.project_id === info.project_id) ?? projects.find((p) => p.name === info.project_name);
      return hit?.project_id ?? null;
    },
    [qc],
  );
}

const shareFileSchema = z.object({ kind: z.literal('file'), url: z.string(), filename: z.string() });
const shareFolderSchema = z.object({
  kind: z.literal('folder'),
  folder_name: z.string(),
  view_only: z.boolean(),
  files: z.array(z.object({ id: z.string(), original_name: z.string(), size: z.number() })),
});
const needsCodeSchema = z.object({
  needs_code: z.literal(true),
  email_masked: z.string(),
  reason: z.enum(['signed_out', 'other_account']),
});

export type ShareFolder = z.infer<typeof shareFolderSchema>;
type ShareResult =
  | z.infer<typeof shareFileSchema>
  | ShareFolder
  | { kind: 'needs_code'; email_masked: string; reason: 'signed_out' | 'other_account' };

/**
 * Opens a share link as `email`. Without a session for that address the server answers 401 needs_code, returned
 * here as a value (it is the normal first step, not an error). Everything else that fails throws.
 */
export async function openShare(shareLinkId: string, email: string, fileId?: string): Promise<ShareResult> {
  const body = { share_link_id: shareLinkId, email: email.trim().toLowerCase(), ...(fileId ? { file_id: fileId } : {}) };
  try {
    return await callFunction('share', body, z.union([shareFileSchema, shareFolderSchema]));
  } catch (e) {
    if (e instanceof FunctionError && e.status === 401) {
      const parsed = needsCodeSchema.safeParse(e.body);
      if (parsed.success) return { kind: 'needs_code', email_masked: parsed.data.email_masked, reason: parsed.data.reason };
    }
    throw e;
  }
}
