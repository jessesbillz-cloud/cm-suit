// Bid write hooks, manager side (SPEC §11.2–11.6). Saves carry a version check; every write refreshes the job's
// bid queries through the one qk.bids prefix.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { readBid } from './bidIntake';
import { fetchSubNames } from './bids.queries';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { notInMock } from './mock/bids';
import { isMock } from './mock';
import { uploadFile } from './upload';
import {
  inviteBiddersResultSchema,
  type AddendumRow,
  type InviteBiddersInput,
  type InviteBiddersResult,
  type PackageRow,
  type QuestionRow,
  type SubmissionRow,
} from './bids.types';

function useRefreshBids() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.bids(projectId) });
}

/** Puts a just-created row into its cached list at once, so opening it never flashes "gone" before the refetch. */
function useAddToList() {
  const qc = useQueryClient();
  return (projectId: string, part: 'packages' | 'addenda', row: unknown) => {
    qc.setQueryData<unknown[]>(qk.bidsPart(projectId, part), (old) => (old ? [...old, row] : old));
  };
}

export function useInviteBidders() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: (input: InviteBiddersInput): Promise<InviteBiddersResult> =>
      isMock() ? Promise.reject(new Error('Not available in the e2e mock.')) : callFunction('invite-bidders', input, inviteBiddersResultSchema),
    onSettled: (_r, _e, input) => refresh(input.project_id),
  });
}

const PACKAGE_COLS = 'id, project_id, code, name, scope_text, version';

export function useAddPackage() {
  const refresh = useRefreshBids();
  const addToList = useAddToList();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; orgId: string; code: string; name: string }): Promise<PackageRow> => {
      if (isMock()) notInMock();
      return throwIfError(
        await supabase
          .from('bid_packages')
          .insert({ org_id: v.orgId, project_id: v.projectId, code: v.code, name: v.name, created_by: user.id })
          .select(PACKAGE_COLS)
          .single(),
      );
    },
    onSuccess: (row) => {
      addToList(row.project_id, 'packages', row);
      return refresh(row.project_id);
    },
  });
}

export type PackagePatch = Pick<PackageRow, 'code' | 'name' | 'scope_text'>;

export function useSavePackage() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { row: PackageRow; patch: PackagePatch }): Promise<PackageRow> => {
      if (isMock()) notInMock();
      const rows = throwIfError(
        await supabase.from('bid_packages').update(v.patch).eq('id', v.row.id).eq('version', v.row.version).select(PACKAGE_COLS),
      );
      const row = rows[0];
      if (!row) throw conflictError();
      return row;
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

export function useAnswerQuestion() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { question: QuestionRow; questionText: string; answer: string; packageOnly: boolean }) => {
      if (isMock()) notInMock();
      return throwIfError(
        await supabase.rpc('answer_bid_question', {
          p_question_id: v.question.id,
          p_question_text: v.questionText,
          p_answer: v.answer,
          p_package_only: v.packageOnly,
        }),
      );
    },
    onSuccess: (_r, v) => refresh(v.question.project_id),
  });
}

async function setQuestionStatus(q: QuestionRow, status: string): Promise<void> {
  const rows = throwIfError(await supabase.from('bid_questions').update({ status }).eq('id', q.id).eq('version', q.version).select('id'));
  if (rows.length === 0) throw conflictError();
}

export function useSetQuestionStatus() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { question: QuestionRow; status: 'dismissed' | 'open' }) => {
      if (isMock()) notInMock();
      await setQuestionStatus(v.question, v.status);
    },
    onSettled: (_r, _e, v) => refresh(v.question.project_id),
  });
}

const ADDENDUM_COLS = 'id, project_id, number, title, body, file_ids, issued_at, version';

/** A draft addendum from a question: numbered by the database, the question marked as going to an addendum. */
export function useAddendumFromQuestion() {
  const refresh = useRefreshBids();
  const addToList = useAddToList();
  return useMutation({
    mutationFn: async (q: QuestionRow): Promise<AddendumRow> => {
      if (isMock()) notInMock();
      const a = throwIfError(
        await supabase.rpc('create_addendum', { p_project_id: q.project_id, p_title: `Question ${String(q.number)}`, p_body: q.question }),
      );
      await setQuestionStatus(q, 'addendum');
      return a;
    },
    onSuccess: (a) => {
      addToList(a.project_id, 'addenda', a);
    },
    onSettled: (_r, _e, q) => refresh(q.project_id),
  });
}

export function useCreateAddendum() {
  const refresh = useRefreshBids();
  const addToList = useAddToList();
  return useMutation({
    mutationFn: async (projectId: string): Promise<AddendumRow> => {
      if (isMock()) notInMock();
      return throwIfError(await supabase.rpc('create_addendum', { p_project_id: projectId, p_title: 'New addendum', p_body: '' }));
    },
    onSuccess: (a) => {
      addToList(a.project_id, 'addenda', a);
      return refresh(a.project_id);
    },
  });
}

type AddendumPatch = Partial<Pick<AddendumRow, 'title' | 'body' | 'file_ids'>>;

export function useSaveAddendum() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { row: AddendumRow; patch: AddendumPatch }): Promise<AddendumRow> => {
      if (isMock()) notInMock();
      return updateAddendum(v.row, v.patch);
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

async function updateAddendum(row: AddendumRow, patch: AddendumPatch): Promise<AddendumRow> {
  const rows = throwIfError(await supabase.from('addenda').update(patch).eq('id', row.id).eq('version', row.version).select(ADDENDUM_COLS));
  const saved = rows[0];
  if (!saved) throw conflictError();
  return saved;
}

/** Uploads a file (the one uploader) into the given folder and adds it to a draft addendum. */
export function useAttachToAddendum() {
  const refresh = useRefreshBids();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { row: AddendumRow; folderId: string; file: File }): Promise<AddendumRow> => {
      if (isMock()) notInMock();
      const { fileId } = await uploadFile({
        file: v.file,
        projectId: v.row.project_id,
        folderId: v.folderId,
        userId: user.id,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      });
      return updateAddendum(v.row, { file_ids: [...v.row.file_ids, fileId] });
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

/** Signs and issues through the edge function. A 403 reauth_required means: email code again, then retry. */
export function useIssueAddendum() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: (row: AddendumRow) =>
      isMock()
        ? Promise.reject(new Error('Not available in the e2e mock.'))
        : callFunction('issue-addendum', { addendum_id: row.id }, z.object({ id: z.string() }).passthrough()),
    onSuccess: (_r, row) => refresh(row.project_id),
  });
}

/** Reads one bid (extract-bid) and links an office-recorded one to its directory sub when the name matches. */
export function useExtractBid() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { projectId: string; orgId: string; submission: SubmissionRow }) => readBid(v.submission, await fetchSubNames(v.orgId)),
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

export function useConfirmExtraction() {
  const refresh = useRefreshBids();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; id: string; version: number }) => {
      const rows = throwIfError(
        await supabase
          .from('bid_extractions')
          .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
          .eq('id', v.id)
          .eq('version', v.version)
          .select('id'),
      );
      if (rows.length === 0) throw conflictError();
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
