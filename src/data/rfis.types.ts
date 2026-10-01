// RFIs (SPEC §14.1, the Sep 28 contract): what rfi_list, rfi_detail, rfi_settings_for and rfi_waiting return, parsed
// at the boundary, and the write inputs. The database decides who may do what (rfi_detail.can); the UI only shows it.
import { z } from 'zod';

export const RFI_STATUSES = ['draft', 'review', 'issue', 'open', 'answered', 'closed', 'void'] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

/** Photos on an RFI (the database allows 20). */
export const RFI_PHOTO_LIMIT = 20;

/** Every rfis column the RPCs return (rfi_detail.rfi and each write). */
export const rfiRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  number: z.number().int().nullable(),
  status: z.enum(RFI_STATUSES),
  title: z.string(),
  question: z.string(),
  suggestion: z.string(),
  refs: z.string(),
  photo_ids: z.array(z.string()),
  cost_impact: z.boolean().nullable(),
  time_impact: z.boolean().nullable(),
  needed_by: z.string().nullable(),
  step: z.number().int(),
  due_at: z.string().nullable(),
  held_since: z.string().nullable(),
  held_opened_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  issued_at: z.string().nullable(),
  answer: z.string().nullable(),
  answer_file_ids: z.array(z.string()),
  answered_at: z.string().nullable(),
  impact_until: z.string().nullable(),
  impact_claimed_at: z.string().nullable(),
  impact_cost: z.boolean().nullable(),
  impact_time: z.boolean().nullable(),
  impact_note: z.string().nullable(),
  impact_gc_note: z.string().nullable(),
  closed_at: z.string().nullable(),
  void_note: z.string().nullable(),
  pdf_file_id: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  version: z.number().int(),
});
export type RfiRow = z.infer<typeof rfiRowSchema>;

/** One row of rfi_list(p_project_id): only RFIs the caller may see. */
export const rfiListRowSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  status: z.enum(RFI_STATUSES),
  title: z.string(),
  created_by: z.string(),
  originator_name: z.string(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  issued_at: z.string().nullable(),
  due_at: z.string().nullable(),
  answered_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  holder_label: z.string(),
  held_since: z.string().nullable(),
  held_opened_at: z.string().nullable(),
  is_mine_to_act: z.boolean(),
  impact_claimed_at: z.string().nullable(),
  impact_until: z.string().nullable(),
  version: z.number().int(),
});
export type RfiListRow = z.infer<typeof rfiListRowSchema>;

const fileRefSchema = z.object({ id: z.string(), original_name: z.string(), mime: z.string() });
export type RfiFileRef = z.infer<typeof fileRefSchema>;

const RFI_EVENT_KINDS = [
  'created',
  'edited',
  'sent',
  'forwarded',
  'returned',
  'issued',
  'opened',
  'answered',
  'impact_claimed',
  'impact_note',
  'closed',
  'voided',
] as const;
export type RfiEventKind = (typeof RFI_EVENT_KINDS)[number];

const canSchema = z.object({
  edit: z.boolean(),
  send: z.boolean(),
  forward: z.boolean(),
  send_back: z.boolean(),
  issue: z.boolean(),
  answer: z.boolean(),
  claim_impact: z.boolean(),
  close: z.boolean(),
  void: z.boolean(),
  gc_note: z.boolean(),
});
export type RfiCan = z.infer<typeof canSchema>;

const routeStateSchema = z.enum(['done', 'current', 'next']);
export type RouteState = z.infer<typeof routeStateSchema>;

/** rfi_detail(p_rfi_id): the RFI, who holds it, what I may do, the full tracker and the history. */
export const rfiDetailSchema = z.object({
  rfi: rfiRowSchema,
  originator_name: z.string(),
  issuer_name: z.string().nullable(),
  answerer_name: z.string().nullable(),
  holder_label: z.string(),
  is_mine_to_act: z.boolean(),
  can: canSchema,
  route: z.array(
    z.object({
      position: z.number().int(),
      label: z.string(),
      state: routeStateSchema,
      done_by_name: z.string().nullable(),
      done_at: z.string().nullable(),
    }),
  ),
  events: z.array(
    z.object({
      at: z.string(),
      kind: z.enum(RFI_EVENT_KINDS),
      actor_name: z.string().nullable(),
      note: z.string().nullable(),
      step: z.number().int().nullable(),
    }),
  ),
  photos: z.array(fileRefSchema),
  answer_files: z.array(fileRefSchema),
  settings: z.object({ answer_days: z.number().int(), impact_days: z.number().int() }),
});
export type RfiDetail = z.infer<typeof rfiDetailSchema>;
export type RfiEvent = RfiDetail['events'][number];

/** A reviewer step of the job's route: a role on the job, or one person. */
const routeEntrySchema = z.object({
  position: z.number().int(),
  role: z.string().nullable(),
  user_id: z.string().nullable(),
  label: z.string(),
});

/** rfi_settings_for / rfi_save_settings: a job without a row gets the database's defaults (version 0). */
export const rfiSettingsSchema = z.object({
  answer_days: z.number().int(),
  impact_days: z.number().int(),
  version: z.number().int(),
  route: z.array(routeEntrySchema),
});
export type RfiSettings = z.infer<typeof rfiSettingsSchema>;

/** A step of an RFI's route on the log's strip: ask (the originator), review, issue, answer (the architect), answered. */
const RFI_STEP_KINDS = ['ask', 'review', 'issue', 'answer', 'answered'] as const;
export type RfiStepKind = (typeof RFI_STEP_KINDS)[number];

/**
 * rfi_progress(p_project_id): one row per step of every RFI the caller may see, in route order. days = whole days it
 * sat there on the job's clock (0 = under a day; the current step counts to now); null ahead and at the end.
 */
export const rfiProgressRowSchema = z.object({
  rfi_id: z.string(),
  position: z.number().int(),
  kind: z.enum(RFI_STEP_KINDS),
  label: z.string(),
  person_name: z.string().nullable(),
  state: routeStateSchema,
  entered_at: z.string().nullable(),
  left_at: z.string().nullable(),
  days: z.number().int().nullable(),
  due_at: z.string().nullable(),
});
export type RfiProgressRow = z.infer<typeof rfiProgressRowSchema>;

const WAITING_REASONS = ['late', 'unopened'] as const;

/** rfi_waiting(): across all my jobs, RFIs I sent or may issue that someone else is sitting on. */
export const rfiWaitingRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  number: z.number().int().nullable(),
  title: z.string(),
  status: z.enum(RFI_STATUSES),
  holder_label: z.string(),
  held_since: z.string().nullable(),
  held_opened_at: z.string().nullable(),
  due_at: z.string().nullable(),
  reason: z.enum(WAITING_REASONS),
});
export type RfiWaitingRow = z.infer<typeof rfiWaitingRowSchema>;

/** The fields a person types (plus the photos). Everything else is filled in by the database. */
export interface RfiFields {
  title: string;
  question: string;
  photoIds: string[];
  suggestion: string;
  refs: string;
  /** yyyy-MM-dd, or null. */
  neededBy: string | null;
  costImpact: boolean | null;
  timeImpact: boolean | null;
}

export interface NewRfiInput extends RfiFields {
  projectId: string;
  /** Makes the create safe to repeat (one per form). */
  key: string;
}

/** A route step as saved: a role or a person. */
export type RouteChoice = { role: string } | { user_id: string };

/** The rfis edge function's answers. */
export const signResultSchema = z.object({ rfi: rfiRowSchema });
export const pdfResultSchema = z.object({ url: z.string().url(), filename: z.string().min(1) });
/** 'view': the same PDF for the browser's own viewer (a fresh signed URL without the download header). */
export const viewResultSchema = z.object({ url: z.string().url() });
export const downloadResultSchema = z.object({ url: z.string().url(), filename: z.string().min(1), mime: z.string() });
