// The fire marshal's review (0106): an RFI, an RFI document or a submittal marked fire / life safety, what OFS decided on
// it, his list, and the designated person's start page. The shapes the database answers, parsed once here.
import { z } from 'zod';

const OFS_KINDS = ['rfi', 'rfi_document', 'submittal'] as const;
export type OfsKind = (typeof OFS_KINDS)[number];

const OFS_DECISIONS = ['approved', 'not_approved'] as const;
export type OfsDecision = (typeof OFS_DECISIONS)[number];

const decisionSchema = z.object({
  decision: z.enum(OFS_DECISIONS),
  comment: z.string().nullable(),
  at: z.string(),
  name: z.string().nullable(),
});
export type OfsDecisionRow = z.infer<typeof decisionSchema>;

/** One item as its panes show it (ofs_item_state); null: nothing to show here. */
export const ofsItemSchema = z
  .object({
    /** null: not marked yet (the caller may mark it). */
    id: z.string().nullable(),
    project_id: z.string().nullish(),
    kind: z.enum(OFS_KINDS).nullish(),
    rfi_id: z.string().nullish(),
    file_id: z.string().nullish(),
    marked: z.boolean(),
    version: z.number(),
    may_mark: z.boolean(),
    /** Reached the fire marshal (marked, and an RFI answered). */
    sent: z.boolean(),
    may_decide: z.boolean(),
    number: z.number().nullish(),
    title: z.string().nullish(),
    file_name: z.string().nullish(),
    mime: z.string().nullish(),
    size: z.number().nullish(),
    section: z.string().nullish(),
    sent_at: z.string().nullish(),
    decision: decisionSchema.nullable(),
    /** Earlier decisions, newest first. */
    history: z.array(decisionSchema),
  })
  .nullable();
export type OfsItem = NonNullable<z.infer<typeof ofsItemSchema>>;

/** A row of the fire marshal's list (ofs_review_list). */
export const ofsReviewRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  kind: z.enum(OFS_KINDS),
  rfi_id: z.string().nullable(),
  file_id: z.string().nullable(),
  number: z.number().nullable(),
  title: z.string(),
  section: z.string().nullable(),
  sent_at: z.string(),
  decision: z.enum(OFS_DECISIONS).nullable(),
  decided_at: z.string().nullable(),
  version: z.number(),
});
export type OfsReviewRow = z.infer<typeof ofsReviewRowSchema>;

const DESK_STATES = ['waiting', 'approved', 'not_approved', 'passed', 'failed'] as const;
export type DeskState = (typeof DESK_STATES)[number];

/** An inspection's schedule state on the start page (0108): where its time stands, and the version Accept carries. */
const deskSchedSchema = z.object({
  state: z.enum(['asked', 'confirmed', 'proposed', 'postponed', 'done', 'withdrawn']),
  date: z.string(),
  time: z.string().nullable(),
  version: z.number(),
  note: z.string().nullable(),
});

const deskRowSchema = z.object({
  id: z.string(),
  kind: z.enum([...OFS_KINDS, 'inspection']),
  target_type: z.enum(['rfi', 'file', 'inspection_request']),
  target_id: z.string(),
  number: z.number().nullable(),
  title: z.string(),
  state: z.enum(DESK_STATES),
  at: z.string(),
  sched: deskSchedSchema.nullable(),
});
export type DeskRow = z.infer<typeof deskRowSchema>;

/** The start page (ofs_desk): the designated person's (designated: the three boxes too), or a requester's own OFS
 *  requests (0109); null for anyone else. */
export const ofsDeskSchema = z.object({ rows: z.array(deskRowSchema), designated: z.boolean() }).nullable();
export type DeskData = NonNullable<z.infer<typeof ofsDeskSchema>>;

/** Where an item is: one of these. */
export type OfsTarget = { itemId: string } | { rfiId: string } | { fileId: string };
