// Permits (migrations 0052, 0061): what permit_list / my_permits, permit_progress, permit_detail and permit_people
// return, parsed at the boundary, and the write inputs. The database decides who may do what (permit_detail.can and
// .moves); the UI only shows it. Stage and kind words live in features/permits/model.
import { z } from 'zod';

/** Every permits column the RPCs return (permit_detail.permit and each write). */
export const permitRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  primary_number: z.string(),
  agency_numbers: z.array(z.string()),
  title: z.string(),
  kind: z.string(),
  stage: z.string(),
  stage_since: z.string(),
  assigned_to: z.string().nullable(),
  issued_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  extensions: z.number().int(),
  notes: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  version: z.number().int(),
});
export type PermitRow = z.infer<typeof permitRowSchema>;

/** One row of the log (permit_list for a job, my_permits across all my jobs). */
export const permitListRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  /** The job's clock, for its dates. */
  timezone: z.string(),
  primary_number: z.string(),
  agency_numbers: z.array(z.string()),
  title: z.string(),
  kind: z.string(),
  stage: z.string(),
  stage_since: z.string(),
  assigned_to: z.string().nullable(),
  assigned_name: z.string().nullable(),
  issued_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  extensions: z.number().int(),
  open_comments: z.number().int(),
  review_cycle: z.number().int(),
  version: z.number().int(),
});
export type PermitListRow = z.infer<typeof permitListRowSchema>;

const STEP_STATES = ['done', 'current', 'next', 'failed'] as const;

/** One place on a permit's tracker (permit_progress): days on the job's clock, null where it never was. */
export const permitStepSchema = z.object({
  permit_id: z.string(),
  position: z.number().int(),
  stage: z.string(),
  state: z.enum(STEP_STATES),
  entered_at: z.string().nullable(),
  left_at: z.string().nullable(),
  days: z.number().int().nullable(),
});
export type PermitStep = z.infer<typeof permitStepSchema>;

/** An answer a later one replaced (another responder's, or a reword), kept on the comment (0054), oldest first. */
const earlierAnswerSchema = z.object({ response: z.string(), by_name: z.string().nullable(), at: z.string().nullable() });
export type EarlierAnswer = z.infer<typeof earlierAnswerSchema>;

export const permitCommentSchema = z.object({
  id: z.string(),
  review_id: z.string(),
  number: z.number().int(),
  sheet: z.string(),
  detail: z.string(),
  code_ref: z.string(),
  body: z.string(),
  response: z.string().nullable(),
  responded_at: z.string().nullable(),
  responded_by_name: z.string().nullable().optional(),
  earlier_answers: z.array(earlierAnswerSchema).optional(),
  status: z.enum(['open', 'closed']),
  closed_cycle: z.number().int().nullable(),
  version: z.number().int(),
});
export type PermitComment = z.infer<typeof permitCommentSchema>;

/** One cycle of a review (0061): the review's number on its permit and its backcheck (0 = the submittal, then BC 1, 2 ...). */
export const permitReviewSchema = z.object({
  id: z.string(),
  permit_id: z.string(),
  /** 1, 2, ... across the permit: every cycle of every review. */
  cycle: z.number().int(),
  review_no: z.number().int(),
  backcheck: z.number().int(),
  kind: z.string(),
  received_on: z.string(),
  returned_on: z.string().nullable(),
  outcome: z.string().nullable(),
  version: z.number().int(),
});
export type PermitReview = z.infer<typeof permitReviewSchema>;

const reviewWithCommentsSchema = permitReviewSchema.extend({ comments: z.array(permitCommentSchema) });
export type PermitReviewWithComments = z.infer<typeof reviewWithCommentsSchema>;

/** An inspection request linked to the permit (or one that could be). */
const permitInspectionSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  /** The OFS IR number, on an OFS request. */
  ofs_number: z.number().int().nullable(),
  kind: z.string(),
  special_kind: z.string().nullable(),
  request_date: z.string(),
  items: z.string(),
  status_key: z.string().optional(),
  version: z.number().int(),
});

const permitEventSchema = z.object({
  stage: z.string(),
  at: z.string(),
  by_name: z.string().nullable(),
  note: z.string().nullable(),
  undone: z.boolean(),
});
export type PermitEvent = z.infer<typeof permitEventSchema>;

export const permitDetailSchema = z.object({
  permit: permitRowSchema,
  project_name: z.string(),
  timezone: z.string(),
  assigned_name: z.string().nullable(),
  created_by_name: z.string(),
  can: z.object({ manage: z.boolean(), respond: z.boolean(), link: z.boolean() }),
  /** Where I may move it, the usual next stage first (empty unless I manage permits). */
  moves: z.array(z.string()),
  /** Required inspections not passed yet: while any is, the database refuses the move to Inspected. */
  open_inspections: z.number().int(),
  steps: z.array(permitStepSchema),
  /** Every cycle, open ones first, then newest first. */
  reviews: z.array(reviewWithCommentsSchema),
  events: z.array(permitEventSchema),
  /** The requests on the permit that I may see. */
  inspections: z.array(permitInspectionSchema),
  linkable: z.array(permitInspectionSchema),
});
export type PermitDetail = z.infer<typeof permitDetailSchema>;

/** Who may be assigned a permit on a job (permit_people). */
export const permitPersonSchema = z.object({ user_id: z.string(), name: z.string() });
export type PermitPerson = z.infer<typeof permitPersonSchema>;

/** The typed fields of a permit (new and edit). */
interface PermitFields {
  primaryNumber: string;
  otherNumbers: string[];
  title: string;
  kind: string;
  assignedTo: string | null;
  notes: string;
}

export interface NewPermitInput extends PermitFields {
  projectId: string;
  stage: string;
  /** The form's key: a repeated save returns the same permit. */
  key: string;
}

export interface PermitEdit extends PermitFields {
  issuedOn: string | null;
  expiresOn: string | null;
  extensions: number;
}

/** What a move needs to name the permit and check its version. */
export type PermitRef = Pick<PermitRow, 'id' | 'project_id' | 'version'>;
