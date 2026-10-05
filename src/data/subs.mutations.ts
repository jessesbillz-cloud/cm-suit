// Sub directory writes (SPEC §11.2). Saves carry a version check; every write refreshes the org's directory through
// the one qk.subs prefix. The import runs server-side (import-subs) and is safe to repeat.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import { notInMock } from './mock/bids';
import * as mockSubs from './mock/subs';
import { SUB_COLS, toSubRow } from './subs.queries';
import { importResultSchema, type CslbResult, type ImportResult, type SubPatch, type SubRow } from './subs.types';

function useRefreshSubs() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: qk.subs(orgId) });
}

/** A saved row replaces its copy in the cached directory, so a field save doesn't refetch 1,600 rows. */
function usePutInList() {
  const qc = useQueryClient();
  return (row: SubRow) => {
    qc.setQueryData<SubRow[]>(qk.subs(row.org_id), (old) => old?.map((s) => (s.id === row.id ? row : s)));
  };
}

export function useAddSub() {
  const refresh = useRefreshSubs();
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { orgId: string; company: string; trades: string[] }): Promise<SubRow> => {
      if (isMock()) notInMock();
      const row = throwIfError(
        await supabase
          .from('subs')
          .insert({ org_id: v.orgId, company: v.company, trades: v.trades, created_by: user.id })
          .select(SUB_COLS)
          .single(),
      );
      return toSubRow(row);
    },
    onSuccess: (row) => {
      // In the cached list at once, so opening it never flashes "gone" before the refetch.
      qc.setQueryData<SubRow[]>(qk.subs(row.org_id), (old) => (old ? [...old, row] : old));
      return refresh(row.org_id);
    },
  });
}

export function useSaveSub() {
  const refresh = useRefreshSubs();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: { row: SubRow; patch: SubPatch }): Promise<SubRow> => {
      if (isMock()) notInMock();
      const rows = throwIfError(
        await supabase.from('subs').update(v.patch).eq('id', v.row.id).eq('version', v.row.version).select(SUB_COLS),
      );
      const row = rows[0];
      if (!row) throw conflictError();
      return toSubRow(row);
    },
    onSuccess: put,
    onError: (_e, v) => refresh(v.row.org_id),
  });
}

/** The result of a manual CSLB lookup; the database stamps the time. */
export function useRecordCslbCheck() {
  const refresh = useRefreshSubs();
  const put = usePutInList();
  return useMutation({
    mutationFn: async (v: { row: SubRow; status: CslbResult }): Promise<SubRow> => {
      if (isMock()) notInMock();
      const r = throwIfError(
        await supabase.rpc('record_cslb_check', { p_sub_id: v.row.id, p_status: v.status, p_version: v.row.version }),
      );
      return toSubRow({
        id: r.id,
        org_id: r.org_id,
        company: r.company,
        trades: r.trades,
        contacts: r.contacts,
        city: r.city,
        zip: r.zip,
        region: r.region,
        cslb_number: r.cslb_number,
        cslb_status: r.cslb_status,
        cslb_checked_at: r.cslb_checked_at,
        license_classes: r.license_classes,
        dir_number: r.dir_number,
        certifications: r.certifications,
        notes: r.notes,
        version: r.version,
      });
    },
    onSuccess: put,
    onError: (_e, v) => refresh(v.row.org_id),
  });
}

/** Sends an .xlsx or .csv master list to import-subs, which merges it into the job's org directory. */
export function useImportSubs() {
  const refresh = useRefreshSubs();
  return useMutation({
    mutationFn: (v: { projectId: string; orgId: string; file: File }): Promise<ImportResult> => {
      if (isMock()) return Promise.reject(new Error('Not available in the e2e mock.'));
      const form = new FormData();
      form.append('project_id', v.projectId);
      form.append('file', v.file, v.file.name);
      return callFunction('import-subs', form, importResultSchema);
    },
    onSettled: (_r, _e, v) => refresh(v.orgId),
  });
}

/** Remove a sub from the directory (or bring it back). Its history and the bids that named it stay. Returns the new
 *  version, which Undo sends. */
export function useRemoveSub() {
  const refresh = useRefreshSubs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { row: SubRow; version: number; removed: boolean }): Promise<number> => {
      if (isMock()) return mockSubs.setRemoved(v.row.id, v.version, v.removed);
      return throwIfError(await supabase.rpc('set_sub_removed', { p_sub_id: v.row.id, p_version: v.version, p_removed: v.removed }));
    },
    onSuccess: (_n, v) => {
      if (v.removed) qc.setQueryData<SubRow[]>(qk.subs(v.row.org_id), (old) => old?.filter((s) => s.id !== v.row.id));
    },
    onSettled: (_r, _e, v) => refresh(v.row.org_id),
  });
}
