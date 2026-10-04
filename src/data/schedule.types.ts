// Schedule shapes (migration 0062): where the job's schedule stands, its versions (uploads), the current activities and
// a draft's rows. Validated with zod at the data layer so a changed contract fails here, loudly.
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** How the schedule came in (schedule_versions.source_kind). */
const SOURCE_KINDS = ['xer', 'msp_xml', 'csv', 'pdf', 'photo', 'excel'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const statusSchema = z.object({
  /** The job's today (its time zone). */
  today: day,
  current_id: z.string().nullable(),
  number: z.number().int().nullable(),
  data_date: day.nullable(),
  days_old: z.number().int().nullable(),
  update_due: z.boolean(),
  /** Drafts waiting (0 for people who can't manage the schedule). */
  drafts: z.number().int(),
});
export type ScheduleStatus = z.infer<typeof statusSchema>;

export const versionRowSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  status: z.enum(['draft', 'current', 'superseded']),
  source_kind: z.enum(SOURCE_KINDS),
  title: z.string().nullable(),
  data_date: day.nullable(),
  file_id: z.string().nullable(),
  file_name: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string(),
  published_at: z.string().nullable(),
  published_by_name: z.string().nullable(),
  activities: z.number().int(),
  version: z.number().int(),
});
export type VersionRow = z.infer<typeof versionRowSchema>;

export const versionSchema = versionRowSchema.extend({
  project_id: z.string(),
  model: z.string().nullable(),
  warnings: z.array(z.string()),
  /** Rows with no start date: publishing waits for them. */
  need_dates: z.number().int(),
  /** Rows the reader wasn't sure of. */
  unsure: z.number().int(),
  discarded: z.boolean(),
  can_manage: z.boolean(),
  /** The publisher, within 15 minutes, while it is current. */
  can_undo: z.boolean(),
});
export type Version = z.infer<typeof versionSchema>;

export const activitySchema = z.object({
  id: z.string(),
  version_id: z.string(),
  activity_code: z.string().nullable(),
  name: z.string(),
  wbs: z.string().nullable(),
  area: z.string().nullable(),
  trade: z.string().nullable(),
  start_date: day.nullable(),
  finish_date: day.nullable(),
  actual_start: day.nullable(),
  actual_finish: day.nullable(),
  percent: z.number().nullable(),
  is_milestone: z.boolean(),
  csi_division: z.string().nullable(),
  sort: z.number().int(),
});
export type Activity = z.infer<typeof activitySchema>;

/** A draft's row as the review edits it. */
export const draftRowSchema = activitySchema.extend({
  unsure: z.boolean(),
  source_ref: z.string().nullable(),
  version: z.number().int(),
});
export type DraftRow = z.infer<typeof draftRowSchema>;

export const DRAFT_COLS =
  'id, version_id, activity_code, name, wbs, area, trade, start_date, finish_date, actual_start, actual_finish, percent, is_milestone, csi_division, sort, unsure, source_ref, version';
export const ACTIVITY_COLS =
  'id, version_id, activity_code, name, wbs, area, trade, start_date, finish_date, actual_start, actual_finish, percent, is_milestone, csi_division, sort';

/** What schedule-import answers. `rows` is null when the file was read before (its draft comes back). */
export const importedSchema = z.object({
  version_id: z.string(),
  source_kind: z.enum(SOURCE_KINDS),
  rows: z.number().int().nullable(),
  warnings: z.array(z.string()),
});
export type Imported = z.infer<typeof importedSchema>;

export const publishedSchema = z.object({ number: z.number().int(), version: z.number().int() });
export type Published = z.infer<typeof publishedSchema>;

/** One row's edit in a draft. Blank text is none; the database trims. */
export interface ActivityInput {
  code: string;
  name: string;
  wbs: string;
  area: string;
  trade: string;
  start: string | null;
  finish: string | null;
  isMilestone: boolean;
}
