// Addendum writes (SPEC §11.5, migration 0076). A draft is numbered by the database when it is made, edited with a
// version check, gets files through the one upload queue (stored in the job's Addenda folder, which bidders can't
// browse), and is discarded with Undo. Issue signs it through the edge function; an issued one never changes.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useDropFromList, usePutInList, useRefreshBids } from './bidsCache';
import type { AddendumRow, QuestionRow } from './bids.types';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import * as mockAddenda from './mock/addenda';
import * as mockQuestions from './mock/questions';
import { isMock } from './mock';
import { useUploadQueue } from './UploadQueue';

const ADDENDUM_COLS = 'id, project_id, number, title, body, file_ids, issued_at, version';

function toRow(a: AddendumRow): AddendumRow {
  return { id: a.id, project_id: a.project_id, number: a.number, title: a.title, body: a.body, file_ids: a.file_ids, issued_at: a.issued_at, version: a.version };
}

async function createAddendum(projectId: string, title: string, body: string): Promise<AddendumRow> {
  if (isMock()) return mockAddenda.create(projectId, title, body);
  return toRow(throwIfError(await supabase.rpc('create_addendum', { p_project_id: projectId, p_title: title, p_body: body })));
}

export function useCreateAddendum() {
  const refresh = useRefreshBids();
  const put = usePutInList();
  return useMutation({
    mutationFn: (projectId: string) => createAddendum(projectId, 'New addendum', ''),
    onSuccess: (a) => {
      put('addenda', a);
      return refresh(a.project_id);
    },
  });
}

/** What a question's addendum starts from: the question as it will be published (never the asker's own words), and the
 *  answer when one is written. */
export function addendumBody(publishedQuestion: string, answer: string): string {
  const q = publishedQuestion.trim();
  const a = answer.trim();
  return a === '' ? q : `${q}\n\n${a}`;
}

async function setQuestionStatus(q: QuestionRow, status: string): Promise<void> {
  if (isMock()) return mockQuestions.setStatus(q, status);
  const rows = throwIfError(await supabase.from('bid_questions').update({ status }).eq('id', q.id).eq('version', q.version).select('id'));
  if (rows.length === 0) throw conflictError();
}

/** A draft addendum from a question: numbered by the database; the question is marked as going to an addendum. */
export function useAddendumFromQuestion() {
  const refresh = useRefreshBids();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: { question: QuestionRow; body: string }): Promise<AddendumRow> => {
      const a = await createAddendum(v.question.project_id, `Question ${String(v.question.number)}`, v.body);
      await setQuestionStatus(v.question, 'addendum');
      return a;
    },
    onSuccess: (a) => {
      put('addenda', a);
    },
    onSettled: (_r, _e, v) => refresh(v.question.project_id),
  });
}

type AddendumPatch = Partial<Pick<AddendumRow, 'title' | 'body' | 'file_ids'>>;

async function updateAddendum(row: AddendumRow, patch: AddendumPatch): Promise<AddendumRow> {
  if (isMock()) return mockAddenda.save(row, patch);
  const rows = throwIfError(await supabase.from('addenda').update(patch).eq('id', row.id).eq('version', row.version).select(ADDENDUM_COLS));
  const saved = rows[0];
  if (!saved) throw conflictError();
  return saved;
}

export function useSaveAddendum() {
  const refresh = useRefreshBids();
  const put = usePutInList();
  return useMutation({
    mutationFn: (v: { row: AddendumRow; patch: AddendumPatch }) => updateAddendum(v.row, v.patch),
    onSuccess: (a) => {
      put('addenda', a);
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

/** The job's Addenda folder (made on first use, bids.manage only): where a draft's files are uploaded. */
export function useAddendaFolder(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'addenda_folder'),
    queryFn: enabled
      ? async (): Promise<string> =>
          isMock() ? `${projectId}-addenda` : throwIfError(await supabase.rpc('open_addenda_folder', { p_project_id: projectId }))
      : skipToken,
    staleTime: Infinity,
  });
}

async function addFile(addendumId: string, fileId: string): Promise<AddendumRow> {
  if (isMock()) return mockAddenda.addFile(addendumId, fileId);
  return toRow(throwIfError(await supabase.rpc('add_addendum_file', { p_addendum_id: addendumId, p_file_id: fileId })));
}

/** Attach: each file goes up through the one queue (progress, Stop, survives leaving the screen), then onto the draft. */
export function useAttachToAddendum() {
  const queue = useUploadQueue();
  const qc = useQueryClient();
  return (row: AddendumRow, folderId: string, files: File[]) => {
    queue.enqueue(files, row.project_id, folderId, async (fileId) => {
      const saved = await addFile(row.id, fileId);
      qc.setQueryData<AddendumRow[]>(qk.bidsPart(row.project_id, 'addenda'), (old) => old?.map((a) => (a.id === saved.id ? saved : a)));
      await qc.invalidateQueries({ queryKey: qk.bids(row.project_id) });
      return 'Attached';
    });
  };
}

/** Discard (or bring back) a draft. Returns the row's new version, which the Undo sends. */
export function useDiscardAddendum() {
  const refresh = useRefreshBids();
  const drop = useDropFromList();
  return useMutation({
    mutationFn: async (v: { row: AddendumRow; version: number; discarded: boolean }): Promise<number> =>
      isMock()
        ? mockAddenda.setDiscarded(v.row.id, v.version, v.discarded)
        : throwIfError(
            await supabase.rpc('set_addendum_discarded', { p_addendum_id: v.row.id, p_version: v.version, p_discarded: v.discarded }),
          ),
    onSuccess: (_n, v) => {
      if (v.discarded) drop(v.row.project_id, 'addenda', v.row.id);
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
