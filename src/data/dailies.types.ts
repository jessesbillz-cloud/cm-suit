// Daily report shapes the app reads (SPEC §13.1). Rows derive from the generated types; content, header and settings
// jsonb are parsed through the one schema in lib/dailies; edge-function answers are pinned with zod at the boundary.
import { z } from 'zod';
import { formSetupSchema, type FormSetup } from '../lib/dailies';
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
  | 'hours'
  | 'form'
>;

export const REPORT_COLS =
  'id, project_id, author_id, report_type, report_date, status, number, header, content, version, signed_at, signed_version, submitted_at, pdf_file_id, filename, hours, form';

export type DailyPhotoRow = Pick<
  Tables<'daily_report_photos'>,
  'id' | 'report_id' | 'file_id' | 'row_key' | 'caption' | 'description' | 'taken_at' | 'version' | 'updated_at' | 'deleted_at'
>;

export const PHOTO_COLS = 'id, report_id, file_id, row_key, caption, description, taken_at, version, updated_at, deleted_at';

/** A person's setup for one form on a job; the one they chose last is the form they write (lib/dailies activeReportType). */
export type DailySetupRow = Pick<Tables<'daily_setups'>, 'id' | 'project_id' | 'report_type' | 'settings' | 'version' | 'chosen_at'>;

export const SETUP_COLS = 'id, project_id, report_type, settings, version, chosen_at';

/** A company's version of its daily forms (orgs.settings.daily_forms, by form id; a form not in it is our standard
 *  one), with the company row's version, which a save carries. */
export interface CompanyForms {
  version: number;
  forms: Record<string, FormSetup>;
}

/** The company row as the forms are read from it. */
export const companyFormsRowSchema = z.object({ version: z.number().int(), settings: z.unknown() });

/** What save_daily_form and add_daily_form_field answer: the company row's new version and the setup as stored. */
export const companyFormSavedSchema = z.object({ version: z.number().int(), setup: formSetupSchema });
export type CompanyFormSaved = z.infer<typeof companyFormSavedSchema>;

/** What the job knows that day (daily_day_facts, as the caller may read it): fills a report as it is opened. */
export const dayFactsSchema = z.object({
  /** Sign-ins at that day's safety meetings, by company and trade (a person once). */
  signins: z.array(z.object({ company: z.string(), trade: z.string(), count: z.number().int() })),
  /** That day's closed meetings. */
  meetings: z.array(z.object({ id: z.string(), kind: z.string(), number: z.number().int(), title: z.string(), signed: z.number().int() })),
  deliveries: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      /** UTC; null = time TBD. */
      starts_at: z.string().nullable(),
      company: z.string(),
      description: z.string(),
      standby: z.boolean(),
    }),
  ),
  inspections: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      kind: z.string(),
      special: z.string().nullable(),
      items: z.string(),
      /** The job's wall-clock time, HH:mm; null = no set time. */
      start_time: z.string().nullable(),
      status: z.string(),
      result: z.string().nullable(),
      helper_id: z.string().nullable(),
    }),
  ),
});
export type DayFacts = z.infer<typeof dayFactsSchema>;

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
