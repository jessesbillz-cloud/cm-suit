// The bidder's side (SPEC §11.4): one page JSON from bidder_page, and the few things a bidder can do.
// Everything here is walled by the RPCs (own membership, own packages); the page never sees other bidders.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mock from './mock/api';
import * as mockBids from './mock/bids';
import { isMock } from './mock';
import { useUploadQueue } from './UploadQueue';
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

async function submitBid(packageId: string, fileId: string): Promise<number> {
  if (isMock()) return mockBids.submit(packageId, fileId);
  return throwIfError(await supabase.rpc('submit_bid', { p_package_id: packageId, p_file_id: fileId })).receipt_number;
}

/**
 * Submit bid: the file goes up through the one upload queue (progress, Stop, survives leaving the page) into "Bids
 * received", then submit_bid gives the receipt (its number is the line's note). A failed submit fails the line, and
 * Retry runs it again.
 */
export function useQueueBid() {
  const queue = useUploadQueue();
  const refresh = useRefreshPage();
  return (v: { projectId: string; packageId: string; folderId: string; file: File }) => {
    queue.enqueue([v.file], v.projectId, v.folderId, async (fileId) => {
      const receipt = await submitBid(v.packageId, fileId);
      await refresh(v.projectId);
      return `Receipt #${String(receipt)}`;
    });
  };
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

/** Plans and Specs and every folder under them that the caller can read (RLS hides the rest). */
function bidDocFolderIds(folders: readonly { id: string; parent_id: string | null; kind: string }[]): string[] {
  const ids = new Set(folders.filter((f) => DOC_KINDS.includes(f.kind)).map((f) => f.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id !== null && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

async function fetchDocuments(projectId: string): Promise<FileRow[]> {
  if (isMock()) {
    const ids = bidDocFolderIds(await mock.folders(projectId));
    return (await Promise.all(ids.map((id) => mock.files(id)))).flat().filter((f) => f.upload_complete);
  }
  const folders = throwIfError(
    await supabase.from('folders').select('id, parent_id, kind').eq('project_id', projectId).is('deleted_at', null),
  );
  const ids = bidDocFolderIds(folders);
  if (ids.length === 0) return [];
  return throwIfError(
    await supabase
      .from('files')
      .select(FILE_COLS)
      .in('folder_id', ids)
      .eq('upload_complete', true)
      .is('deleted_at', null)
      .is('superseded_by', null)
      .order('original_name'),
  );
}

/** The job's Plans and Specs files (and those in folders under them) a bidder can read (folder_can_read decides, 0076). */
export function useBidDocuments(projectId: string) {
  return useQuery({ queryKey: qk.bidsPart(projectId, 'documents'), queryFn: () => fetchDocuments(projectId) });
}
