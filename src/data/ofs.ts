// The fire marshal's review (0106), read and written only here: an item's mark and decisions, his list across my jobs,
// the designated person's start page, the standard fire list. Every write is an RPC that runs as me: the mark with its
// version check, the decision with its version check and my key (a retry answers the same). After any write the OFS
// answers, the rail's counts and the board refresh.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/ofs';
import {
  ofsDeskSchema,
  ofsItemSchema,
  ofsReviewRowSchema,
  type DeskData,
  type OfsDecision,
  type OfsItem,
  type OfsReviewRow,
  type OfsTarget,
} from './ofs.types';

function targetArgs(t: OfsTarget): { p_item_id?: string; p_rfi_id?: string; p_file_id?: string } {
  if ('itemId' in t) return { p_item_id: t.itemId };
  if ('rfiId' in t) return { p_rfi_id: t.rfiId };
  return { p_file_id: t.fileId };
}

function targetKey(t: OfsTarget): string {
  if ('itemId' in t) return `item:${t.itemId}`;
  if ('rfiId' in t) return `rfi:${t.rfiId}`;
  return `file:${t.fileId}`;
}

async function fetchItem(t: OfsTarget): Promise<OfsItem | null> {
  if (isMock()) return mock.itemState(t);
  return ofsItemSchema.parse(throwIfErrorMaybe(await supabase.rpc('ofs_item_state', targetArgs(t))));
}

/** One item's mark and decisions; null when there is nothing to show (not marked and not mine to mark). */
export function useOfsItem(t: OfsTarget | null) {
  return useQuery({ queryKey: qk.ofsPart('item', t ? targetKey(t) : ''), queryFn: t ? () => fetchItem(t) : skipToken });
}

async function fetchReview(projectId: string | null): Promise<OfsReviewRow[]> {
  if (isMock()) return mock.reviewList(projectId);
  const raw = throwIfError(await supabase.rpc('ofs_review_list', projectId === null ? {} : { p_project_id: projectId }));
  return z.array(ofsReviewRowSchema).parse(raw);
}

/** Every item that reached me as the fire marshal, on a job or (null) all my jobs: waiting or decided. */
export function useOfsReview(projectId: string | null, enabled = true) {
  return useQuery({ queryKey: qk.ofsPart('review', projectId ?? 'all'), queryFn: enabled ? () => fetchReview(projectId) : skipToken });
}

async function fetchDesk(projectId: string): Promise<DeskData | null> {
  if (isMock()) return mock.desk(projectId);
  return ofsDeskSchema.parse(throwIfErrorMaybe(await supabase.rpc('ofs_desk', { p_project_id: projectId })));
}

/** The start page: what waits on OFS and what came back (the designated person's, or a requester's own); null for
 *  anyone else. */
export function useOfsDesk(projectId: string) {
  return useQuery({ queryKey: qk.ofsPart('desk', projectId), queryFn: () => fetchDesk(projectId) });
}

async function fetchStandard(): Promise<string[]> {
  if (isMock()) return mock.standard();
  return z.array(z.string()).parse(throwIfError(await supabase.rpc('ofs_fire_standard')));
}

/** The standard fire list (the job's settings box shows it until the job has its own). */
export function useOfsStandard(enabled: boolean) {
  return useQuery({ queryKey: qk.ofsPart('standard'), queryFn: enabled ? fetchStandard : skipToken, staleTime: Infinity });
}

function useRefresh() {
  const qc = useQueryClient();
  return async (projectId: string | null) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.ofs }),
      qc.invalidateQueries({ queryKey: qk.toolCounts(projectId) }),
      qc.invalidateQueries({ queryKey: qk.toolCounts(null) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
    ]);
  };
}

export interface MarkInput {
  projectId: string;
  target: { rfiId: string } | { fileId: string };
  on: boolean;
  version: number;
}

async function mark(v: MarkInput): Promise<OfsItem> {
  if (isMock()) return mock.mark(v);
  const args = 'rfiId' in v.target ? { p_rfi_id: v.target.rfiId } : { p_file_id: v.target.fileId };
  const raw = throwIfErrorMaybe(await supabase.rpc('ofs_mark', { ...args, p_on: v.on, p_version: v.version }));
  const item = ofsItemSchema.parse(raw);
  if (item === null) throw new Error('The mark was not saved.');
  return item;
}

/** Fire / life safety on or off (Undo is the same call back). */
export function useOfsMark() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: mark, onSettled: (_r, _e, v) => refresh(v.projectId) });
}

/** A file just uploaded on the designated person's page goes to OFS marked (safe to repeat). */
export async function markUploaded(projectId: string, fileId: string): Promise<void> {
  await mark({ projectId, target: { fileId }, on: true, version: 0 });
}

/** Files just uploaded: marked on when their spec section is on the job's fire list (the database decides). */
export async function suggestOfs(fileIds: readonly string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  if (isMock()) return mock.suggest();
  return throwIfError(await supabase.rpc('ofs_suggest', { p_file_ids: [...fileIds] }));
}

export interface DecideInput {
  projectId: string;
  itemId: string;
  version: number;
  decision: OfsDecision;
  comment: string;
  /** This decision's own key: a retry of the same tap answers the same. */
  key: string;
}

async function decide(v: DecideInput): Promise<OfsItem> {
  if (isMock()) return mock.decide(v);
  const comment = v.comment.trim();
  const raw = throwIfErrorMaybe(
    await supabase.rpc('ofs_decide', {
      p_item_id: v.itemId,
      p_version: v.version,
      p_decision: v.decision,
      ...(comment === '' ? {} : { p_comment: comment }),
      p_key: v.key,
    }),
  );
  const item = ofsItemSchema.parse(raw);
  if (item === null) throw new Error('The decision was not saved.');
  return item;
}

/** The fire marshal's Approved or Not approved. */
export function useOfsDecide() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: decide, onSettled: (_r, _e, v) => refresh(v.projectId) });
}
