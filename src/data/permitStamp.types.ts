// The official's stamp on a permit's plans (migration 0053, edge function permit-stamp): what permit_approved and
// permit_stamp_sources return and what the function answers, parsed at the boundary. The database decides who may
// stamp and when (permit_approved.stamp); the UI only shows it.
import { z } from 'zod';

/** One stamped file of a set. */
const approvedFileSchema = z.object({
  file_id: z.string(),
  name: z.string(),
  size: z.number(),
  /** The original it was stamped from (null if that file is gone). */
  source_name: z.string().nullable(),
  content_hash: z.string(),
});

/** The files stamped together; the newest set is current until another supersedes it. */
const approvedSetSchema = z.object({
  set_no: z.number().int(),
  stamped_at: z.string(),
  stamped_by_name: z.string(),
  note: z.string().nullable(),
  superseded_at: z.string().nullable(),
  files: z.array(approvedFileSchema),
});
export type ApprovedSet = z.infer<typeof approvedSetSchema>;

const STAMP_MODES = ['issue', 'revise'] as const;
export type StampMode = (typeof STAMP_MODES)[number];

/** permit_approved: the sets (newest first) and what I may do now (null: nothing). */
export const permitApprovedSchema = z.object({
  stamp: z.enum(STAMP_MODES).nullable(),
  sets: z.array(approvedSetSchema),
});
export type PermitApproved = z.infer<typeof permitApprovedSchema>;

/** One PDF on the job the official may stamp (permit_stamp_sources). */
export const stampSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  folder_id: z.string(),
  folder_name: z.string(),
  folder_kind: z.string(),
  created_at: z.string(),
});
export type StampSource = z.infer<typeof stampSourceSchema>;

/** The function's answer to one 'stamp': the copy waiting to be recorded. */
export const stampedFileSchema = z.object({
  source_file_id: z.string(),
  stamped_file_id: z.string(),
  stamped_at: z.string(),
  name: z.string(),
  pages: z.number().int(),
});
export type StampedFile = z.infer<typeof stampedFileSchema>;

/** The function's answer to 'record'. */
export const recordResultSchema = z.object({
  set_no: z.number().int(),
  files: z.number().int(),
  issued: z.boolean(),
});
export type RecordResult = z.infer<typeof recordResultSchema>;

export const viewResultSchema = z.object({ url: z.string().url() });
