// Corrections log (SPEC §13.4): row shapes parsed at the boundary, the step rules, and the write inputs.
// The database (set_correction_status + its table guard) is the gate; STEP_FROM and STEP_CAPABILITY only decide which
// buttons to show, and the e2e mock follows them.
import { z } from 'zod';

export const CORRECTION_STATUSES = ['open', 'ready', 'corrected', 'signed_off', 'reopened'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/** What a person can move an item to. "open" only comes back through undo. */
export type CorrectionStep = Exclude<CorrectionStatus, 'open'>;
export const CORRECTION_STEPS: readonly CorrectionStep[] = ['ready', 'corrected', 'signed_off', 'reopened'];

/** The statuses each step may start from (the same list as set_correction_status). */
export const STEP_FROM: Record<CorrectionStep, readonly CorrectionStatus[]> = {
  ready: ['open', 'reopened'],
  corrected: ['open', 'ready', 'reopened'],
  signed_off: ['open', 'ready', 'corrected', 'reopened'],
  reopened: ['ready', 'corrected', 'signed_off'],
};

/** Who may take each step. Only corrections.close sets Corrected, Signed off or Reopened. */
export const STEP_CAPABILITY: Record<CorrectionStep, 'corrections.mark_ready' | 'corrections.close'> = {
  ready: 'corrections.mark_ready',
  corrected: 'corrections.close',
  signed_off: 'corrections.close',
  reopened: 'corrections.close',
};

/** Photos per step (mark ready, decisions) and on the item itself. */
export const STEP_PHOTO_LIMIT = 6;
export const ITEM_PHOTO_LIMIT = 12;

export const correctionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string(),
  photo_ids: z.array(z.string()),
  status: z.enum(CORRECTION_STATUSES),
  trade: z.string(),
  location: z.string(),
  spec_tags: z.array(z.string()),
  notice_file_id: z.string().nullable(),
  notice_ref: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  closed_at: z.string().nullable(),
  version: z.number(),
});
export type CorrectionRow = z.infer<typeof correctionSchema>;

export const CORRECTION_COLS =
  'id, project_id, number, title, description, photo_ids, status, trade, location, spec_tags, notice_file_id, notice_ref, created_by, created_at, closed_at, version';

const HISTORY_ACTIONS = ['created', 'edited', 'ready', 'corrected', 'signed_off', 'reopened', 'undone'] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export const correctionHistorySchema = z.object({
  id: z.string(),
  seq: z.number(),
  correction_id: z.string(),
  actor_user_id: z.string().nullable(),
  action: z.enum(HISTORY_ACTIONS),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  note: z.string(),
  photo_ids: z.array(z.string()),
  created_at: z.string(),
  undoes: z.string().nullable(),
});
export type CorrectionHistoryRow = z.infer<typeof correctionHistorySchema>;

export const HISTORY_COLS = 'id, seq, correction_id, actor_user_id, action, from_status, to_status, note, photo_ids, created_at, undoes';

/** The fields a person types. The CN number is the notice's number (the database's, at Save): nobody types another
 * one (0086). Spec sections go in the description as written; spec_tags and notice_ref are only read (older items). */
export interface CorrectionFields {
  title: string;
  description: string;
  trade: string;
  location: string;
}

export interface NewCorrectionInput extends CorrectionFields {
  projectId: string;
  /** Makes the create safe to repeat (one per form, never the item's id). */
  requestKey: string;
  photoIds: string[];
  noticeFileId: string | null;
}

export interface StepInput {
  row: CorrectionRow;
  status: CorrectionStep;
  note: string;
  photoIds: string[];
}

export interface UndoResult {
  row: CorrectionRow;
  /** The undone step was the create: the item is gone. */
  removed: boolean;
}

export interface PhotoFile {
  id: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: string;
}
