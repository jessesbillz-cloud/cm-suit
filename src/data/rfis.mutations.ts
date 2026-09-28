// RFI writes (the Sep 28 contract). Every move is its own RPC run as me, version-checked where it takes one; the two
// signatures (Sign & send, Sign & issue) go through the rfis edge function, which asks for a fresh sign-in (SignButton).
// A written row goes into the cached RFI at once (the next save needs its version); then the job's RFI queries, the
// waiting list, the board and my tasks refresh.
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { saveFile } from '../lib/saveFile';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockMoves from './mock/rfiMoves';
import * as mockRfis from './mock/rfis';
import { uploadFile } from './upload';
import {
  downloadResultSchema,
  pdfResultSchema,
  rfiRowSchema,
  rfiSettingsSchema,
  signResultSchema,
  type NewRfiInput,
  type RfiDetail,
  type RfiFields,
  type RfiListRow,
  type RfiRow,
  type RfiSettings,
  type RouteChoice,
} from './rfis.types';

/** What a move needs to name the RFI and check its version. */
type RfiRef = Pick<RfiRow, 'id' | 'project_id' | 'version'>;

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function parseRow(data: unknown): RfiRow {
  return rfiRowSchema.parse(Array.isArray(data) ? data[0] : data);
}

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.rfis(projectId) }),
      qc.invalidateQueries({ queryKey: qk.rfiWaiting }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
      qc.invalidateQueries({ queryKey: qk.tasksAll }),
    ]);
}

/** The written row, into the cached RFI and its log line, before the refetch. */
function usePutRow() {
  const qc = useQueryClient();
  return (row: RfiRow) => {
    qc.setQueryData<RfiDetail>(qk.rfisPart(row.project_id, 'detail', row.id), (old) => (old ? { ...old, rfi: row } : old));
    qc.setQueryData<RfiListRow[]>(qk.rfisPart(row.project_id, 'list'), (old) =>
      old?.map((r) => (r.id === row.id ? { ...r, status: row.status, title: row.title, number: row.number, version: row.version } : r)),
    );
  };
}

function useRfiMove<V extends { ref: RfiRef }>(run: (v: V) => Promise<RfiRow>) {
  const refresh = useRefresh();
  const put = usePutRow();
  return useMutation({ mutationFn: run, onSuccess: put, onSettled: (_r, _e, v) => refresh(v.ref.project_id) });
}

function fieldArgs(f: RfiFields) {
  return {
    p_title: f.title.trim(),
    p_question: f.question.trim(),
    p_photo_ids: f.photoIds,
    p_suggestion: f.suggestion.trim(),
    p_refs: f.refs.trim(),
  };
}

/** A new draft (rfi.create_draft). The form's key makes a repeated save return the same draft. */
export function useCreateRfi() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: NewRfiInput): Promise<RfiRow> => {
      if (isMock()) return mockMoves.create(v);
      const data: unknown = throwIfError(
        await supabase.rpc('rfi_create', {
          p_project_id: v.projectId,
          ...fieldArgs(v),
          ...(v.neededBy ? { p_needed_by: v.neededBy } : {}),
          ...(v.costImpact !== null ? { p_cost_impact: v.costImpact } : {}),
          ...(v.timeImpact !== null ? { p_time_impact: v.timeImpact } : {}),
          p_key: v.key,
        }),
      );
      return parseRow(data);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Saves the typed fields (the holder, while draft / review / issue). Autosave: no list refresh per keystroke. */
export function useUpdateRfi() {
  const put = usePutRow();
  return useMutation({
    mutationFn: async (v: { ref: RfiRef; fields: RfiFields }): Promise<RfiRow> => {
      if (isMock()) return mockMoves.update(v.ref.id, v.ref.version, v.fields);
      const data: unknown = throwIfError(
        await supabase.rpc('rfi_update', {
          p_rfi_id: v.ref.id,
          p_version: v.ref.version,
          ...fieldArgs(v.fields),
          p_needed_by: sqlNull(v.fields.neededBy),
          p_cost_impact: sqlNull(v.fields.costImpact),
          p_time_impact: sqlNull(v.fields.timeImpact),
        }),
      );
      return parseRow(data);
    },
    onSuccess: put,
  });
}

/** The two signatures run in the edge function as me; it answers 403 reauth_required without a fresh sign-in. */
function useSign(action: 'send' | 'issue') {
  return useRfiMove(async (v: { ref: RfiRef }): Promise<RfiRow> => {
    if (isMock()) return action === 'send' ? mockMoves.signSend(v.ref.id, v.ref.version) : mockMoves.signIssue(v.ref.id, v.ref.version);
    const res = await callFunction('rfis', { action, rfi_id: v.ref.id, version: v.ref.version }, signResultSchema);
    return res.rfi;
  });
}

export function useSignSend() {
  return useSign('send');
}

export function useSignIssue() {
  return useSign('issue');
}

export function useForwardRfi() {
  return useRfiMove(async (v: { ref: RfiRef; note: string }) => {
    const note = v.note.trim();
    if (isMock()) return mockMoves.forward(v.ref.id, v.ref.version, note === '' ? null : note);
    const args = { p_rfi_id: v.ref.id, p_version: v.ref.version, ...(note === '' ? {} : { p_note: note }) };
    return parseRow(throwIfError(await supabase.rpc('rfi_forward', args)));
  });
}

export function useSendBackRfi() {
  return useRfiMove(async (v: { ref: RfiRef; note: string }) => {
    if (isMock()) return mockMoves.sendBack(v.ref.id, v.ref.version, v.note);
    return parseRow(throwIfError(await supabase.rpc('rfi_send_back', { p_rfi_id: v.ref.id, p_version: v.ref.version, p_note: v.note.trim() })));
  });
}

export function useAnswerRfi() {
  return useRfiMove(async (v: { ref: RfiRef; answer: string; fileIds: string[] }) => {
    if (isMock()) return mockMoves.answer(v.ref.id, v.ref.version, v.answer, v.fileIds);
    const args = { p_rfi_id: v.ref.id, p_version: v.ref.version, p_answer: v.answer.trim(), p_file_ids: v.fileIds };
    return parseRow(throwIfError(await supabase.rpc('rfi_answer', args)));
  });
}

export function useClaimImpact() {
  return useRfiMove(async (v: { ref: RfiRef; cost: boolean; time: boolean; note: string }) => {
    if (isMock()) return mockMoves.claimImpact(v.ref.id, v.cost, v.time, v.note);
    const args = { p_rfi_id: v.ref.id, p_cost: v.cost, p_time: v.time, p_note: v.note.trim() };
    return parseRow(throwIfError(await supabase.rpc('rfi_claim_impact', args)));
  });
}

export function useGcNote() {
  return useRfiMove(async (v: { ref: RfiRef; note: string }) => {
    if (isMock()) return mockMoves.gcNote(v.ref.id, v.note);
    return parseRow(throwIfError(await supabase.rpc('rfi_gc_note', { p_rfi_id: v.ref.id, p_note: v.note.trim() })));
  });
}

export function useCloseRfi() {
  return useRfiMove(async (v: { ref: RfiRef }) => {
    if (isMock()) return mockMoves.close(v.ref.id, v.ref.version);
    return parseRow(throwIfError(await supabase.rpc('rfi_close', { p_rfi_id: v.ref.id, p_version: v.ref.version })));
  });
}

export function useVoidRfi() {
  return useRfiMove(async (v: { ref: RfiRef; note: string }) => {
    if (isMock()) return mockMoves.voidRfi(v.ref.id, v.ref.version, v.note);
    return parseRow(throwIfError(await supabase.rpc('rfi_void', { p_rfi_id: v.ref.id, p_version: v.ref.version, p_note: v.note.trim() })));
  });
}

interface RfiSettingsInput {
  version: number;
  answerDays: number;
  impactDays: number;
  route: RouteChoice[];
}

/** The job's RFI settings (rfi.sign_issue). Version 0 is the first save. */
export function useSaveRfiSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: RfiSettingsInput): Promise<RfiSettings> => {
      if (isMock()) return mockMoves.saveSettings(projectId, v.version, v.answerDays, v.impactDays, v.route);
      const data: unknown = throwIfError(
        await supabase.rpc('rfi_save_settings', {
          p_project_id: projectId,
          p_version: v.version,
          p_answer_days: v.answerDays,
          p_impact_days: v.impactDays,
          p_route: v.route,
        }),
      );
      return rfiSettingsSchema.parse(data);
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.rfisPart(projectId, 'settings'), saved);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.rfis(projectId) }),
  });
}

/** "PDF": the server renders the current state (DRAFT before issue), stores it, and hands back a fresh signed URL. */
export function useRfiPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ref: RfiRef): Promise<void> => {
      if (isMock()) {
        const { blob, filename } = await mockMoves.pdf(ref.id);
        await saveFile(blob, filename);
        return;
      }
      const res = await callFunction('rfis', { action: 'pdf', rfi_id: ref.id }, pdfResultSchema);
      await saveFile(res.url, res.filename);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

/** A photo, an answer file or the PDF of an RFI: one click, the original filename, a fresh signed URL. */
export function useRfiDownload() {
  return useMutation({
    mutationFn: async (v: { rfiId: string; fileId: string }): Promise<void> => {
      if (isMock()) {
        const { blob, filename } = await mockRfis.fileBlob(v.fileId);
        await saveFile(blob, filename);
        return;
      }
      const res = await callFunction('rfis', { action: 'download', rfi_id: v.rfiId, file_id: v.fileId }, downloadResultSchema);
      await saveFile(res.url, res.filename);
    },
  });
}

async function rfiFolder(projectId: string): Promise<string> {
  if (isMock()) return mockRfis.folder(projectId);
  return z.string().parse(throwIfError(await supabase.rpc('rfi_folder', { p_project_id: projectId })));
}

/**
 * Uploads one file (a compressed photo, or an answer file) into the job's RFIs folder and resolves to its file id.
 * A plain callback, not a mutation, so several files upload side by side.
 */
export function useRfiUpload() {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (projectId: string, file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({ queryKey: qk.rfisPart(projectId, 'folder'), queryFn: () => rfiFolder(projectId), staleTime: Infinity });
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return fileId;
    },
    [qc, userId],
  );
}
