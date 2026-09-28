// Required bid forms (SPEC §11.1, migration 0034): one job's checklist. Reading it first runs open_bid_forms, which
// makes the job's "Bid forms" folder once and adds the forms that apply and aren't there yet (safe to repeat), so the
// list and the Forms tab count are always current. RLS: bids.manage only. Saves carry a version check.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockForms from './mock/bidForms';
import { uploadFile } from './upload';

export const FORM_TIMINGS = ['with_bid', 'after_award'] as const;
export type FormTiming = (typeof FORM_TIMINGS)[number];
export const FORM_STATUSES = ['to_do', 'done', 'n_a'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

const itemSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  template_id: z.string().nullable(),
  name: z.string(),
  reference: z.string(),
  timing: z.enum(FORM_TIMINGS),
  required: z.boolean(),
  status: z.enum(FORM_STATUSES),
  file_id: z.string().nullable(),
  due_on: z.string().nullable(),
  note: z.string(),
  sort: z.number(),
  version: z.number(),
  /** The attached file when the person can open it (RLS on files decides). */
  file: z.object({ id: z.string(), original_name: z.string(), size: z.number() }).nullable(),
});
export type BidFormItem = z.infer<typeof itemSchema>;

export interface BidForms {
  /** The job's Bid forms folder: attachments are uploaded here. */
  folderId: string;
  items: BidFormItem[];
}

/** What a person changes on a form. `removed` sets deleted_at (the row leaves the list); Undo sends false. */
export type FormPatch = Partial<{ status: FormStatus; file_id: string | null; due_on: string | null; note: string; removed: boolean }>;

const COLS =
  'id, project_id, template_id, name, reference, timing, required, status, file_id, due_on, note, sort, version, file:files(id, original_name, size)';

async function fetchBidForms(projectId: string): Promise<BidForms> {
  if (isMock()) return mockForms.open(projectId);
  const folderId = throwIfError(await supabase.rpc('open_bid_forms', { p_project_id: projectId }));
  const rows = throwIfError(
    await supabase
      .from('bid_form_items')
      .select(COLS)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('sort')
      .order('created_at'),
  );
  return { folderId, items: z.array(itemSchema).parse(rows) };
}

export function useBidForms(projectId: string) {
  return useQuery({ queryKey: qk.bidsPart(projectId, 'forms'), queryFn: () => fetchBidForms(projectId) });
}

async function saveItem(row: BidFormItem, patch: FormPatch): Promise<BidFormItem> {
  if (isMock()) return mockForms.save(row, patch);
  const { removed, ...fields } = patch;
  const update = removed === undefined ? fields : { ...fields, deleted_at: removed ? new Date().toISOString() : null };
  const rows = throwIfError(
    await supabase.from('bid_form_items').update(update).eq('id', row.id).eq('version', row.version).select(COLS),
  );
  const saved = rows[0];
  if (!saved) throw conflictError();
  return itemSchema.parse(saved);
}

/** Puts a saved row into the cached list at once (a removed one leaves it), then refetches. */
function useSettle() {
  const qc = useQueryClient();
  return {
    put: (saved: BidFormItem, removed: boolean) => {
      qc.setQueryData<BidForms>(qk.bidsPart(saved.project_id, 'forms'), (old) => {
        if (!old) return old;
        const rest = old.items.filter((i) => i.id !== saved.id);
        return { ...old, items: removed ? rest : [...rest, saved].sort((a, b) => a.sort - b.sort) };
      });
    },
    refetch: (projectId: string) => qc.invalidateQueries({ queryKey: qk.bidsPart(projectId, 'forms') }),
  };
}

export function useSaveBidForm() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (v: { row: BidFormItem; patch: FormPatch }) => saveItem(v.row, v.patch),
    onSuccess: (saved, v) => {
      settle.put(saved, v.patch.removed === true);
    },
    onSettled: (_r, _e, v) => settle.refetch(v.row.project_id),
  });
}

/** Uploads the form (the one uploader) into the job's Bid forms folder and attaches it; an open form becomes done. */
export function useAttachBidForm() {
  const settle = useSettle();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { row: BidFormItem; folderId: string; file: File }): Promise<BidFormItem> => {
      const { fileId } = await uploadFile({
        file: v.file,
        projectId: v.row.project_id,
        folderId: v.folderId,
        userId: user.id,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      });
      return saveItem(v.row, v.row.status === 'to_do' ? { file_id: fileId, status: 'done' } : { file_id: fileId });
    },
    onSuccess: (saved) => {
      settle.put(saved, false);
    },
    onSettled: (_r, _e, v) => settle.refetch(v.row.project_id),
  });
}

/** A form this job needs that no template covers (e.g. an owner's own RFP form). */
export function useAddBidForm() {
  const settle = useSettle();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; orgId: string; name: string; timing: FormTiming }): Promise<BidFormItem> => {
      if (isMock()) return mockForms.add(v.projectId, v.name, v.timing);
      const row = throwIfError(
        await supabase
          .from('bid_form_items')
          .insert({ org_id: v.orgId, project_id: v.projectId, name: v.name, timing: v.timing, created_by: user.id })
          .select(COLS)
          .single(),
      );
      return itemSchema.parse(row);
    },
    onSuccess: (saved) => {
      settle.put(saved, false);
    },
    onSettled: (_r, _e, v) => settle.refetch(v.projectId),
  });
}
