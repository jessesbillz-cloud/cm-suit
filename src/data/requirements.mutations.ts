// Requirements writes (migrations 0069, 0073). Each is its own RPC run as me (add or change, the one-tap status, keep
// or drop a draft, remove, the evidence: the manager's, or a company's own on its own line), version-checked where it
// takes one; reading a spec section with AI goes through the requirements-extract function. The status, Keep and Drop
// show at once (the list is patched, and put back if the server says no); every write then refreshes the job's
// requirements.
import { useCallback } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { RequirementStatus } from '../lib/requirements';
import { saveFile } from '../lib/saveFile';
import { useUser } from './auth';
import { supabase } from './client';
import { downloadFile } from './download';
import { DataError, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requirements';
import {
  extractedSchema,
  savedSchema,
  statusSetSchema,
  type ExtractInput,
  type Extracted,
  type Requirement,
  type RequirementInput,
  type Saved,
} from './requirements.types';
import { uploadFile } from './upload';

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new DataError('The server answered nothing.', null, null);
  return row;
}

type Snapshot = Requirement[] | undefined;

/** Changes the cached list at once; answers what to put back if the write fails. */
async function patchList(qc: QueryClient, projectId: string, change: (rows: Requirement[]) => Requirement[]): Promise<Snapshot> {
  const key = qk.requirementsPart(projectId, 'list');
  await qc.cancelQueries({ queryKey: key });
  const before = qc.getQueryData<Requirement[]>(key);
  if (before) qc.setQueryData<Requirement[]>(key, change(before));
  return before;
}

/**
 * The writes of one job run one after another (TanStack's mutation scope), and each sends the newest version this
 * screen knows of the line: the one it was handed, or a newer one its own earlier write got back. So a quick second tap
 * (or an Undo right after) doesn't trip over the first; someone else's change still does (the server has moved on).
 */
function useWrite(projectId: string) {
  const qc = useQueryClient();
  const key = qk.requirementsPart(projectId, 'list');
  return {
    qc,
    scope: { id: `requirements:${projectId}` },
    version: (id: string, handed: number): number =>
      Math.max(handed, qc.getQueryData<Requirement[]>(key)?.find((r) => r.id === id)?.version ?? 0),
    /** The version my write got back, kept in the list until it refreshes. */
    bump: (saved: Saved) => {
      qc.setQueryData<Requirement[]>(key, (rows) => rows?.map((r) => (r.id === saved.id ? { ...r, version: saved.version } : r)));
    },
    restore: (before: Snapshot) => {
      if (before) qc.setQueryData(key, before);
    },
    refresh: () => qc.invalidateQueries({ queryKey: qk.requirements(projectId) }),
  };
}

/** Add one by hand (a repeat with the same key is the same line) or change one (with its version). */
export function useSaveRequirement(projectId: string) {
  const w = useWrite(projectId);
  return useMutation({
    scope: w.scope,
    mutationFn: async (v: RequirementInput): Promise<Saved> => {
      if (isMock()) return mock.save(projectId, v);
      const rows: unknown = throwIfError(
        await supabase.rpc('requirement_save', {
          p_project_id: projectId, p_id: sqlNull(v.id), p_version: sqlNull(v.version), p_key: v.key, p_kind: v.kind,
          p_title: v.title, p_details: v.details, p_spec_section: v.specSection, p_spec_title: v.specTitle, p_spec_ref: v.specRef,
          p_responsible: v.responsible, p_required: v.required, p_notice_days: sqlNull(v.noticeDays),
          p_lead_days: sqlNull(v.leadDays), p_activity_code: v.activityCode, p_activity_name: v.activityName,
          p_trigger_date: sqlNull(v.triggerDate), p_company_org_id: sqlNull(v.companyOrgId),
        }),
      );
      return first(z.array(savedSchema).parse(rows));
    },
    onSettled: w.refresh,
  });
}

interface StatusArgs {
  row: Pick<Requirement, 'id' | 'version'>;
  status: RequirementStatus;
}

/** One tap: the new status (Undo sets the old one back with the version this answers). */
export function useSetRequirementStatus(projectId: string) {
  const w = useWrite(projectId);
  return useMutation({
    scope: w.scope,
    mutationFn: async ({ row, status }: StatusArgs): Promise<Saved> => {
      const version = w.version(row.id, row.version);
      if (isMock()) return mock.setStatus(row.id, version, status);
      const rows: unknown = throwIfError(await supabase.rpc('requirement_set_status', { p_id: row.id, p_version: version, p_status: status }));
      const out = first(z.array(statusSetSchema).parse(rows));
      return { id: out.id, version: out.version };
    },
    onSuccess: w.bump,
    onMutate: ({ row, status }: StatusArgs) => patchList(w.qc, projectId, (rows) => rows.map((r) => (r.id === row.id ? { ...r, status } : r))),
    onError: (_e, _v, before) => {
      w.restore(before);
    },
    onSettled: w.refresh,
  });
}

/** Keep a draft (one tap), or send a kept AI line back to the drafts (Undo). */
export function useKeepRequirement(projectId: string) {
  const w = useWrite(projectId);
  return useMutation({
    scope: w.scope,
    mutationFn: async (v: { id: string; version: number; keep: boolean }): Promise<Saved> => {
      const version = w.version(v.id, v.version);
      if (isMock()) return mock.keep(v.id, version, v.keep);
      const rows: unknown = throwIfError(await supabase.rpc('requirement_keep', { p_id: v.id, p_version: version, p_keep: v.keep }));
      return first(z.array(savedSchema).parse(rows));
    },
    onSuccess: w.bump,
    onMutate: (v) => patchList(w.qc, projectId, (rows) => rows.map((r) => (r.id === v.id ? { ...r, draft: !v.keep } : r))),
    onError: (_e, _v, before) => {
      w.restore(before);
    },
    onSettled: w.refresh,
  });
}

/** Drop a draft or remove a line (one tap), or put it back (Undo). */
export function useRemoveRequirement(projectId: string) {
  const w = useWrite(projectId);
  return useMutation({
    scope: w.scope,
    mutationFn: async (v: { id: string; removed: boolean }): Promise<number> => {
      if (isMock()) return mock.remove(v.id, v.removed);
      return z.number().int().parse(throwIfError(await supabase.rpc('requirement_remove', { p_id: v.id, p_removed: v.removed })));
    },
    onMutate: (v) => (v.removed ? patchList(w.qc, projectId, (rows) => rows.filter((r) => r.id !== v.id)) : Promise.resolve(undefined)),
    onError: (_e, _v, before) => {
      w.restore(before);
    },
    onSettled: w.refresh,
  });
}

/** The evidence: a note and/or a file. `own`: my company's own line (requirement_evidence_own), not the manager's write. */
export function useRequirementEvidence(projectId: string, own: boolean) {
  const w = useWrite(projectId);
  return useMutation({
    scope: w.scope,
    mutationFn: async (v: { id: string; version: number; note: string; fileId: string | null }): Promise<Saved> => {
      const version = w.version(v.id, v.version);
      if (isMock()) return own ? mock.evidenceOwn(v.id, version, v.note, v.fileId) : mock.evidence(v.id, version, v.note, v.fileId);
      const args = { p_id: v.id, p_version: version, p_note: v.note, p_file_id: sqlNull(v.fileId) };
      const rows: unknown = own
        ? throwIfError(await supabase.rpc('requirement_evidence_own', args))
        : throwIfError(await supabase.rpc('requirement_evidence', args));
      return first(z.array(savedSchema).parse(rows));
    },
    onSuccess: w.bump,
    onSettled: w.refresh,
  });
}

/** Read one spec section with AI: its requirements land in Drafts. */
export function useExtractRequirements(projectId: string) {
  const w = useWrite(projectId);
  return useMutation({
    mutationFn: async (v: ExtractInput): Promise<Extracted> => {
      if (isMock()) return mock.extract(projectId, v);
      const body =
        v.source === 'file'
          ? { source: 'file', project_id: projectId, file_id: v.fileId, first_page: v.firstPage, last_page: v.lastPage }
          : { source: 'text', project_id: projectId, text: v.text };
      return callFunction('requirements-extract', body, extractedSchema);
    },
    onSettled: w.refresh,
  });
}

/** The job's Requirements folder: the manager's call, or the one for a company's own evidence (they add, never read it). */
async function requirementsFolder(projectId: string, own: boolean): Promise<string> {
  if (isMock()) return mock.folder(projectId, own);
  const args = { p_project_id: projectId };
  const id: unknown = own
    ? throwIfError(await supabase.rpc('requirements_folder_own', args))
    : throwIfError(await supabase.rpc('requirements_folder', args));
  return z.string().parse(id);
}

/** Uploads one file (a photo, a report, a letter) into the job's Requirements folder and resolves to its file id. */
export function useRequirementsUpload(projectId: string, own: boolean) {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({
        queryKey: qk.requirementsPart(projectId, own ? 'folder-own' : 'folder'),
        queryFn: () => requirementsFolder(projectId, own),
        staleTime: Infinity,
      });
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return fileId;
    },
    [qc, projectId, userId, own],
  );
}

/** Downloads an evidence file: the one download path, a fresh signed URL, logged. */
export async function downloadEvidence(fileId: string): Promise<void> {
  if (isMock()) {
    const { blob, filename } = await mock.fileBlob(fileId);
    await saveFile(blob, filename);
    return;
  }
  await downloadFile(fileId);
}
