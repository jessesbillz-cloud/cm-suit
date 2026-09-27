// The bidder's side (SPEC §11.4): one page JSON from bidder_page, and the few things a bidder can do.
// Everything here is walled by the RPCs (own membership, own packages); the page never sees other bidders.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mock from './mock/api';
import * as mockBids from './mock/bids';
import { isMock } from './mock';
import { uploadFile } from './upload';
import { bidderPageSchema, type BidderPage } from './bids.types';
import type { FileRow } from './types';

const pageKey = (projectId: string) => qk.bidsPart(projectId, 'bidder_page');

async function fetchBidderPage(projectId: string): Promise<BidderPage> {
  if (isMock()) return mockBids.bidderPage(projectId);
  const json: unknown = throwIfError(await supabase.rpc('bidder_page', { p_project_id: projectId }));
  return bidderPageSchema.parse(json);
}

export function useBidderPage(projectId: string) {
  return useQuery({ queryKey: pageKey(projectId), queryFn: () => fetchBidderPage(projectId) });
}

/** Silent: opening the page marks my invites opened. Safe to repeat. */
export async function markInviteOpened(projectId: string): Promise<void> {
  if (isMock()) return;
  throwIfErrorMaybe(await supabase.rpc('mark_invite_opened', { p_project_id: projectId }));
}

function useRefreshPage() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: pageKey(projectId) });
}

export function useSetBidIntent() {
  const refresh = useRefreshPage();
  return useMutation({
    mutationFn: async (v: { projectId: string; inviteId: string; intent: 'intends' | 'declined'; reason?: string | undefined }) => {
      if (isMock()) return mockBids.setIntent(v.inviteId, v.intent);
      const args = { p_invite_id: v.inviteId, p_intent: v.intent, ...(v.reason ? { p_reason: v.reason } : {}) };
      throwIfError(await supabase.rpc('set_bid_intent', args));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

interface SubmitInput {
  projectId: string;
  packageId: string;
  folderId: string;
  file: File;
  onProgress: (loaded: number, total: number) => void;
}

/** Upload (the one uploader) into the bids-received folder, then submit_bid for the receipt. */
export function useSubmitBid() {
  const refresh = useRefreshPage();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: SubmitInput) => {
      const { fileId } = await uploadFile({
        file: v.file,
        projectId: v.projectId,
        folderId: v.folderId,
        userId: user.id,
        onProgress: v.onProgress,
        signal: new AbortController().signal,
      });
      if (isMock()) return mockBids.submit(v.packageId, fileId);
      throwIfError(await supabase.rpc('submit_bid', { p_package_id: v.packageId, p_file_id: fileId }));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

export function useAskBidQuestion() {
  const refresh = useRefreshPage();
  return useMutation({
    mutationFn: async (v: { projectId: string; packageId: string; question: string }) => {
      if (isMock()) return mockBids.ask(v.question);
      throwIfError(await supabase.rpc('ask_bid_question', { p_project_id: v.projectId, p_package_id: v.packageId, p_question: v.question }));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** One click. Optimistic: the button turns into "Acknowledged" at once; a failure puts it back. */
export function useAcknowledgeAddendum() {
  const qc = useQueryClient();
  const refresh = useRefreshPage();
  return useMutation({
    mutationFn: async (v: { projectId: string; addendumId: string }) => {
      if (isMock()) return mockBids.acknowledge(v.addendumId);
      throwIfErrorMaybe(await supabase.rpc('acknowledge_addendum', { p_addendum_id: v.addendumId }));
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: pageKey(v.projectId) });
      const before = qc.getQueryData<BidderPage>(pageKey(v.projectId));
      if (before) {
        qc.setQueryData<BidderPage>(pageKey(v.projectId), {
          ...before,
          addenda: before.addenda.map((a) => (a.id === v.addendumId ? { ...a, acked_at: new Date().toISOString() } : a)),
        });
      }
      return { before };
    },
    onError: (_e, v, ctx) => {
      if (ctx?.before) qc.setQueryData(pageKey(v.projectId), ctx.before);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

const DOC_KINDS = ['plans', 'specs'];
const FILE_COLS = 'id, project_id, folder_id, original_name, mime, size, scan_status, upload_complete, created_at, created_by';

async function fetchDocuments(projectId: string): Promise<FileRow[]> {
  if (isMock()) {
    const folders = (await mock.folders(projectId)).filter((f) => DOC_KINDS.includes(f.kind));
    return (await Promise.all(folders.map((f) => mock.files(f.id)))).flat();
  }
  const folders = throwIfError(
    await supabase.from('folders').select('id').eq('project_id', projectId).in('kind', DOC_KINDS).is('deleted_at', null),
  );
  if (folders.length === 0) return [];
  return throwIfError(
    await supabase
      .from('files')
      .select(FILE_COLS)
      .in(
        'folder_id',
        folders.map((f) => f.id),
      )
      .eq('upload_complete', true)
      .is('deleted_at', null)
      .is('superseded_by', null)
      .order('original_name'),
  );
}

/** The job's Plans and Specs files a bidder can read (folder_can_read decides through RLS). */
export function useBidDocuments(projectId: string) {
  return useQuery({ queryKey: qk.bidsPart(projectId, 'documents'), queryFn: () => fetchDocuments(projectId) });
}
