// Inspection writes, on the side of whoever decides the request (ir.decide; ir.ofs_decide on an OFS request sent to
// OFS, 0061). Each step is its own small RPC; the database checks that I own the request (or am its helper) and the
// version. The IR PDF and the results email are edge functions (server-made, signed): they are not in the e2e mock.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import { irRpc, useIrMutation, type IrRef } from './inspections.mutations';
import { irPdfResultSchema, irSendResultSchema, type IrSendResult } from './inspections.types';

const base = (row: IrRef) => ({ p_request_id: row.id, p_version: row.version });

/** An optional text argument: left out when empty, so the database's default (null) applies. */
function text<K extends string>(key: K, v: string | null): Partial<Record<K, string>> {
  const t = v?.trim() ?? '';
  return (t === '' ? {} : { [key]: t }) as Partial<Record<K, string>>;
}

export function useConfirmIr() {
  return useIrMutation((v: { row: IrRef; note: string | null }) => irRpc('ir_confirm', { ...base(v.row), ...text('p_note', v.note) }));
}

export function useUnconfirmIr() {
  return useIrMutation((row: IrRef) => irRpc('ir_unconfirm', base(row)));
}

export function useSetAttendance() {
  return useIrMutation((v: { row: IrRef; attendance: 'be_present' | 'alone' | null }) =>
    irRpc('ir_set_attendance', { ...base(v.row), ...(v.attendance ? { p_attendance: v.attendance } : {}) }),
  );
}

export interface ResultInput {
  row: IrRef;
  result: 'approved' | 'not_approved' | null;
  note: string | null;
  photoIds: readonly string[];
}

export function useSetResult() {
  return useIrMutation((v: ResultInput) =>
    irRpc('ir_set_result', {
      ...base(v.row),
      ...(v.result ? { p_result: v.result } : {}),
      ...text('p_note', v.note),
      p_photo_ids: [...v.photoIds],
    }),
  );
}

export function usePostponeIr() {
  return useIrMutation((v: { row: IrRef; reason: string; note: string; until: string | null }) =>
    irRpc('ir_postpone', { ...base(v.row), p_reason: v.reason, ...text('p_note', v.note), ...(v.until ? { p_until: v.until } : {}) }),
  );
}

/** The inspector's one step on an OFS request (0061): it goes to OFS and is the deputy's from there. */
export function useSendOfs() {
  return useIrMutation((row: IrRef) => irRpc('ir_send_ofs', base(row)));
}

/** Undo of the send: the inspector who sent it, until the deputy has acted on it. */
export function useUnsendOfs() {
  return useIrMutation((row: IrRef) => irRpc('ir_unsend_ofs', base(row)));
}

export function useAssignHelper() {
  return useIrMutation((v: { row: IrRef; helperId: string | null }) =>
    irRpc('ir_assign_helper', { ...base(v.row), ...(v.helperId ? { p_helper_id: v.helperId } : {}) }),
  );
}

export function useClaimIr() {
  return useIrMutation((row: IrRef) => irRpc('ir_claim', base(row)));
}

export function useHelperReport() {
  return useIrMutation((v: { row: IrRef; report: 'passed' | 'issues' | null; note: string | null }) =>
    irRpc('ir_helper_report', { ...base(v.row), ...(v.report ? { p_report: v.report } : {}), ...text('p_note', v.note) }),
  );
}

export function useDeletePdf() {
  return useIrMutation((row: IrRef) => irRpc('ir_delete_pdf', base(row)));
}

function notInMock(): never {
  throw new Error('The IR PDF and email are not available in the e2e mock.');
}

/** The IR PDF and the Files folder it lands in refresh after any PDF step. */
function useAfterPdf() {
  const qc = useQueryClient();
  return async (projectId: string) => {
    await qc.invalidateQueries({ queryKey: qk.inspections(projectId) });
    await qc.invalidateQueries({ queryKey: ['files'] });
  };
}

/** Generate IR / Update PDF: signed on the server (SignButton handles the identity check). */
export function useGenerateIr() {
  const after = useAfterPdf();
  return useMutation({
    mutationFn: async (v: { row: IrRef; filename: string }) => {
      if (isMock()) notInMock();
      return callFunction('ir-pdf', { action: 'generate', request_id: v.row.id, filename: v.filename }, irPdfResultSchema);
    },
    onSettled: (_r, _e, v) => after(v.row.project_id),
  });
}

/** After a postpone or a re-confirm: the same signed IR with or without the POSTPONED mark. */
export function useRestampIr() {
  const after = useAfterPdf();
  return useMutation({
    mutationFn: async (row: IrRef) => {
      if (isMock()) notInMock();
      return callFunction('ir-pdf', { action: 'restamp', request_id: row.id }, irPdfResultSchema);
    },
    onSettled: (_r, _e, row) => after(row.project_id),
  });
}

export function useSendResults() {
  const after = useAfterPdf();
  return useMutation({
    mutationFn: async (v: { row: IrRef; memberIds: string[] }): Promise<IrSendResult> => {
      if (isMock()) notInMock();
      return callFunction('ir-send', { request_id: v.row.id, member_ids: v.memberIds }, irSendResultSchema);
    },
    onSettled: (_r, _e, v) => after(v.row.project_id),
  });
}
