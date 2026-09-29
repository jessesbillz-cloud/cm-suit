// Daily report shapes the app reads (SPEC §13.1). Rows derive from the generated types; content, header and settings
// jsonb are parsed through the one schema in lib/dailies; edge-function answers are pinned with zod at the boundary.
import { z } from 'zod';
import type { Tables } from './database.types';

export type DailyReportRow = Pick<
  Tables<'daily_reports'>,
  | 'id'
  | 'project_id'
  | 'author_id'
  | 'report_type'
  | 'report_date'
  | 'status'
  | 'number'
  | 'header'
  | 'content'
  | 'version'
  | 'signed_at'
  | 'signed_version'
  | 'submitted_at'
  | 'pdf_file_id'
  | 'filename'
>;

export const REPORT_COLS =
  'id, project_id, author_id, report_type, report_date, status, number, header, content, version, signed_at, signed_version, submitted_at, pdf_file_id, filename';

export type DailyPhotoRow = Pick<
  Tables<'daily_report_photos'>,
  'id' | 'report_id' | 'file_id' | 'row_key' | 'caption' | 'description' | 'taken_at' | 'version' | 'updated_at' | 'deleted_at'
>;

export const PHOTO_COLS = 'id, report_id, file_id, row_key, caption, description, taken_at, version, updated_at, deleted_at';

/** A person's setup for one form on a job; the one they chose last is the form they write (lib/dailies activeReportType). */
export type DailySetupRow = Pick<Tables<'daily_setups'>, 'id' | 'project_id' | 'report_type' | 'settings' | 'version' | 'chosen_at'>;

export const SETUP_COLS = 'id, project_id, report_type, settings, version, chosen_at';

/** What submit-daily answers. */
export const submitResultSchema = z.object({
  id: z.string(),
  status: z.literal('submitted'),
  number: z.number().int(),
  filename: z.string(),
  pdf_file_id: z.string(),
  version: z.number().int(),
  signed_at: z.string(),
});
export type SubmitResult = z.infer<typeof submitResultSchema>;

/** What email-daily answers: one line per recipient, with a mail-app link as the fallback. */
export const emailResultSchema = z.object({
  delivery_status: z.enum(['sent', 'failed']),
  recipients: z.array(z.string()),
  deliveries: z.array(
    z.object({ email: z.string(), status: z.string(), error: z.string().nullable(), mailto: z.string() }),
  ),
});
export type EmailResult = z.infer<typeof emailResultSchema>;
