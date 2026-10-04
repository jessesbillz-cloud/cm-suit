// Inspection writes, requester and GC side (SPEC §13.2), plus the pieces every IR write shares. Every write is an RPC
// that runs as me, with a version check; the database numbers requests and keeps their history.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { compressPhoto, jpegName } from '../lib/compressPhoto';
import { saveFile } from '../lib/saveFile';
import { useUser } from './auth';
import { supabase } from './client';
import type { Database } from './database.types';
import { throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import * as mock from './mock/inspections';
import { isMock } from './mock';
import { uploadFile } from './upload';
import { irDownloadSchema, type IrRequest, type IrRowRaw, type IrWhen, type NewBlock, type NewIrRequest } from './inspections.types';

type Fns = Database['public']['Functions'];
type IrRpcName =
  | 'ir_submit'
  | 'ir_move'
  | 'ir_withdraw'
  | 'ir_restore'
  | 'ir_gc_decide'
  | 'ir_confirm'
  | 'ir_unconfirm'
  | 'ir_set_attendance'
  | 'ir_set_result'
  | 'ir_postpone'
  | 'ir_assign_helper'
  | 'ir_claim'
  | 'ir_helper_report'
  | 'ir_delete_pdf'
  | 'ir_send_ofs'
  | 'ir_unsend_ofs';

/** The request fields a write needs: which one, and the version I saw (the database refuses a stale one). */
export type IrRef = Pick<IrRequest, 'id' | 'version' | 'project_id'>;

/** Calls one IR RPC as me; each returns the whole updated row. */
export async function irRpc<N extends IrRpcName>(name: N, args: Fns[N]['Args']): Promise<IrRowRaw> {
  if (isMock()) return mock.rpc(name, args);
  // Every name above returns public.inspection_requests; the generic call can't name one shape, so it is set here.
  const row: unknown = throwIfError(await supabase.rpc(name, args));
  return row as IrRowRaw;
}

/** After a write: the open request shows the new row at once (its next save carries the new version), then every
 *  inspections query of the job refreshes. */
function useIrApply() {
  const qc = useQueryClient();
  return (row: IrRowRaw) => {
    qc.setQueryData<IrRequest | null>(qk.inspectionsPart(row.project_id, 'request', row.id), (old) => (old ? { ...old, ...row } : old));
    return qc.invalidateQueries({ queryKey: qk.inspections(row.project_id) });
  };
}

export function useIrMutation<V>(run: (v: V) => Promise<IrRowRaw>) {
  const apply = useIrApply();
  return useMutation({ mutationFn: run, onSuccess: apply });
}

function whenArgs(w: IrWhen) {
  return {
    p_duration_kind: w.durationKind,
    ...(w.startTime !== null ? { p_start_time: w.startTime } : {}),
    ...(w.durationMin !== null ? { p_duration_min: w.durationMin } : {}),
  };
}

export function useSubmitIr() {
  return useIrMutation((v: NewIrRequest) =>
    irRpc('ir_submit', {
      p_project_id: v.projectId,
      p_company: v.company,
      p_request_date: v.date,
      p_kind: v.kind,
      p_items: v.items,
      p_notice_ack: v.noticeAck,
      p_attachment_ids: v.attachmentIds,
      ...whenArgs(v),
      ...(v.specialKindId !== null ? { p_special_kind_id: v.specialKindId } : {}),
      // 0061: the OFS request's one question, and the inspector's one statement when he files it himself.
      ...(v.specialRequired !== null ? { p_special_required: v.specialRequired } : {}),
      ...(v.inspectorAck ? { p_inspector_ack: true } : {}),
    }),
  );
}

export function useMoveIr() {
  return useIrMutation((v: { row: IrRef; when: IrWhen }) =>
    irRpc('ir_move', { p_request_id: v.row.id, p_version: v.row.version, p_request_date: v.when.date, ...whenArgs(v.when) }),
  );
}

export function useWithdrawIr() {
  return useIrMutation((row: IrRef) => irRpc('ir_withdraw', { p_request_id: row.id, p_version: row.version }));
}

export function useRestoreIr() {
  return useIrMutation((row: IrRef) => irRpc('ir_restore', { p_request_id: row.id, p_version: row.version }));
}

export function useGcDecide() {
  return useIrMutation((v: { row: IrRef; approve: boolean; note: string }) =>
    irRpc('ir_gc_decide', {
      p_request_id: v.row.id,
      p_version: v.row.version,
      p_approve: v.approve,
      ...(v.note.trim() !== '' ? { p_note: v.note.trim() } : {}),
    }),
  );
}

/** Photos are compressed (lib/compressPhoto); PDFs go as they are; nothing else. Members' uploads and the public
 *  request link's files alike. */
export async function prepareIrFile(file: File): Promise<File> {
  if (file.type.startsWith('image/')) {
    return new File([await compressPhoto(file)], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  }
  if (file.type === 'application/pdf') return file;
  throw new Error(`${file.name}: photos or PDFs only.`);
}

async function attachmentsFolder(projectId: string): Promise<string> {
  if (isMock()) return mock.folder(projectId);
  return throwIfError(await supabase.rpc('ir_folder', { p_project_id: projectId, p_which: 'attachments' }));
}

export interface IrUpload {
  id: string;
  name: string;
}

/** Uploads request photos/PDFs (or result photos) through the one uploader into the job's inspection folder. */
export function useIrUpload(projectId: string) {
  const user = useUser();
  return useMutation({
    mutationFn: async (files: File[]): Promise<IrUpload[]> => {
      const folderId = await attachmentsFolder(projectId);
      const out: IrUpload[] = [];
      for (const picked of files) {
        const file = await prepareIrFile(picked);
        const signal = new AbortController().signal;
        const { fileId } = await uploadFile({ file, projectId, folderId, userId: user.id, signal, onProgress: () => undefined });
        out.push({ id: fileId, name: file.name });
      }
      return out;
    },
  });
}

/** "View IR" and a request's own files: a fresh signed URL per click, the original filename (lib/saveFile). */
export function useDownloadIrFile() {
  return useMutation({
    mutationFn: async (v: { requestId: string; fileId?: string | undefined }) => {
      if (isMock()) throw new Error('Downloads are not available in the e2e mock.');
      const res = await callFunction('ir-pdf', { action: 'download', request_id: v.requestId, ...(v.fileId ? { file_id: v.fileId } : {}) }, irDownloadSchema);
      await saveFile(res.url, res.filename);
    },
  });
}

export function useAddBlock() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: async (b: NewBlock) => {
      if (isMock()) {
        await mock.addBlock(b);
        return;
      }
      throwIfError(
        await supabase.from('ir_blocks').insert({
          org_id: b.orgId,
          project_id: b.projectId,
          block_date: b.date,
          start_time: b.startTime,
          end_time: b.endTime,
          repeat_weekly: b.weekly,
          repeat_until: b.weekly ? b.until : null,
          created_by: user.id,
        }).select('id'),
      );
    },
    onSettled: (_r, _e, b) => qc.invalidateQueries({ queryKey: qk.inspections(b.projectId) }),
  });
}

/** Removes blocked time (the caller commits it after the Undo toast is gone). */
export function useRemoveBlock(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isMock()) {
        await mock.removeBlock(id);
        return;
      }
      const rows = throwIfError(await supabase.from('ir_blocks').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id'));
      if (rows.length === 0) throw new Error('That blocked time is already gone.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.inspections(projectId) }),
  });
}
