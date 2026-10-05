// Daily reports (SPEC §13.1): the ONE content schema, the ONE setup settings schema (its defaults live here only,
// CLAUDE.md rule 9) and the small rules both sides need. Shared by the browser (src/lib/dailies.ts re-exports it) and
// the submit-daily / email-daily edge functions, so a report means the same thing everywhere. Pure: zod only, no
// relative imports (the browser build reads this file too).
import { z } from 'zod';

/** The built-in work-log template's report type (daily_reports.report_type). Company forms use their own id
 *  (reportForms.ts). */
export const DAILY_REPORT_TYPE = 'daily';

/** A company form's field key (reportForms.ts): settings.locked and content.fields are keyed by these. */
const formKey = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Bad field key');
/** At most this many keys in settings.locked or content.fields. */
const FORM_KEYS_MAX = 40;

// ---------------------------------------------------------------------------------------------------------------------
// Setup (daily_setups.settings): one row per person per job per report type.
// ---------------------------------------------------------------------------------------------------------------------
export const DAILY_SETTINGS_DEFAULTS = {
  /** The report's name on screen, in the PDF title and the default filename. */
  label: 'Daily Report',
  /** 0 = Sunday .. 6 = Saturday. Today's working copy is made on these days. */
  schedule_days: [1, 2, 3, 4, 5] as number[],
  /** "Submit by" in the job's time zone, HH:mm. */
  submit_by: '17:00',
  /** Reminder lead time before submit-by, in minutes. Not on the Setup screen until the push exists (the calendar shows
   *  the due time). */
  reminder_minutes: 60,
  filename_pattern: 'Daily Report {#} {Project} {MM-DD-YYYY}',
  /** Who "Email to team" sends to. Stored here, so the server reads recipients from the database. */
  recipients: [] as string[],
  /** Stamp the signature on the PDF. */
  signature: true,
  photos_per_page: 2 as 1 | 2 | 4,
  /** Goes on every report. A company form puts it in its standing field (e.g. the VIS form's IOR Notes). */
  standing_note: '',
  /** A company form's job values (reportForms.ts), typed once and printed on every report. */
  locked: {} as Record<string, string>,
};

type SettingsKey = keyof typeof DAILY_SETTINGS_DEFAULTS;

export const dailySettingsSchema = z.object({
  label: z.string().trim().min(1, 'Name the report').max(80),
  schedule_days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  submit_by: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Submit by needs a time'),
  reminder_minutes: z.number().int().min(0).max(720),
  filename_pattern: z.string().trim().min(1, 'Filename is empty').max(200),
  recipients: z.array(z.string().trim().toLowerCase().email('A recipient is not an email address').max(320)).max(50),
  signature: z.boolean(),
  photos_per_page: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  standing_note: z.string().max(4000),
  locked: z
    .record(formKey, z.string().max(1000))
    .refine((o) => Object.keys(o).length <= FORM_KEYS_MAX, 'Too many job values'),
});
export type DailySettings = z.output<typeof dailySettingsSchema>;

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isSettingsKey(k: unknown): k is SettingsKey {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(DAILY_SETTINGS_DEFAULTS, k);
}

/** Reads a stored setup: missing fields get their defaults, a bad stored field falls back to its default alone. */
export function parseDailySettings(v: unknown): DailySettings {
  const raw: Record<string, unknown> = { ...DAILY_SETTINGS_DEFAULTS, ...asObject(v) };
  const first = dailySettingsSchema.safeParse(raw);
  if (first.success) return first.data;
  for (const issue of first.error.issues) {
    const key = issue.path[0];
    if (isSettingsKey(key)) raw[key] = DAILY_SETTINGS_DEFAULTS[key];
  }
  return dailySettingsSchema.parse(raw);
}

// ---------------------------------------------------------------------------------------------------------------------
// Header (daily_reports.header): job info locked in when the report was made.
// ---------------------------------------------------------------------------------------------------------------------
export const dailyHeaderSchema = z.object({
  project_name: z.string().default(''),
  project_number: z.string().default(''),
  project_address: z.string().default(''),
  author_name: z.string().default(''),
  author_company: z.string().default(''),
  label: z.string().min(1).catch(DAILY_SETTINGS_DEFAULTS.label),
  timezone: z.string().min(1),
});
export type DailyHeader = z.output<typeof dailyHeaderSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Content (daily_reports.content): the work log, the note sections, the weather line.
// ---------------------------------------------------------------------------------------------------------------------
export const NOTE_SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'safety', label: 'Safety' },
  { key: 'materials', label: 'Materials' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'qc', label: 'QC' },
] as const;
export type NoteKey = (typeof NOTE_SECTIONS)[number]['key'];

const NOTE_KEYS = ['general', 'safety', 'materials', 'equipment', 'qc'] as const satisfies readonly NoteKey[];
const note = z.string().max(20000).default('');

const workRowSchema = z.object({
  /** The row's key inside this report (links a photo to the row). Unique per report; not a database id. */
  key: z.string().min(1).max(64),
  /** Company or activity. */
  company: z.string().max(200).default(''),
  description: z.string().max(4000).default(''),
  headcount: z.number().int().min(0).max(100000).nullable().default(null),
  hours: z.number().min(0).max(100000).nullable().default(null),
  /** Comes back on the next report (hours and photos reset). */
  carry: z.boolean().default(false),
});
export type WorkRow = z.output<typeof workRowSchema>;

/** At most this many tables on a report, and cells in a row. */
const TABLES_MAX = 20;
const CELLS_MAX = 12;
/** A filled-in row's source ("delivery:<id>", "ir:<id>", "crew:<company>|<trade>"), and a safety line's. */
const ref = z.string().min(1).max(200);

/** A row of a form's table (reportForms.ts FormTable): its cells by column key, all text (numbers too, as typed). */
const tableRowSchema = z.object({
  /** The row's key inside its table. Unique per table; not a database id. */
  key: z.string().min(1).max(64),
  /** Where a filled-in row came from; null when typed. */
  ref: ref.nullable().default(null),
  /** Comes back on the next report, its numbers cleared (the form's carry tables set it). */
  carry: z.boolean().default(false),
  cells: z
    .record(formKey, z.string().max(4000))
    .refine((o) => Object.keys(o).length <= CELLS_MAX, 'Too many cells')
    .default({}),
});
export type TableRow = z.output<typeof tableRowSchema>;

export const dailyContentSchema = z
  .object({
    weather: z.string().max(300).default(''),
    /** Filled from the setup when the report is made. */
    standing_note: z.string().max(4000).default(''),
    work: z.array(workRowSchema).max(200).default([]),
    notes: z
      .object({ general: note, safety: note, materials: note, equipment: note, qc: note })
      .default({}),
    /** Sections that come back on the next report. */
    carry_sections: z.array(z.enum(NOTE_KEYS)).max(NOTE_KEYS.length).default([]),
    /**
     * Reserved for inspections: IR results written into the report for the inspection date, one entry per IR (ref),
     * updated in place when regenerated. Filled by the inspections module, never typed here.
     */
    inspections: z
      .array(z.object({ ref: z.string().min(1).max(100), text: z.string().max(4000) }))
      .max(100)
      .default([]),
    /** A company form's daily values (reportForms.ts), by field key. The work log leaves it empty. */
    fields: z
      .record(formKey, z.string().max(20000))
      .refine((o) => Object.keys(o).length <= FORM_KEYS_MAX, 'Too many fields')
      .default({}),
    /** A form's tables (reportForms.ts), by table key: manpower, deliveries, crew... The work log leaves it empty. */
    tables: z
      .record(formKey, z.array(tableRowSchema).max(200))
      .refine((o) => Object.keys(o).length <= TABLES_MAX, 'Too many tables')
      .default({}),
    /** Sources already filled in on this report (rows and safety lines): one taken off stays off. Never carried. */
    pulled: z.array(ref).max(1000).default([]),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.work.forEach((row, i) => {
      if (seen.has(row.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['work', i, 'key'], message: 'Duplicate row key' });
      seen.add(row.key);
    });
    for (const [table, rows] of Object.entries(c.tables)) {
      const keys = new Set<string>();
      rows.forEach((row, i) => {
        if (keys.has(row.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tables', table, i, 'key'], message: 'Duplicate row key' });
        keys.add(row.key);
      });
    }
  });
export type DailyContent = z.output<typeof dailyContentSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Rules both sides apply.
// ---------------------------------------------------------------------------------------------------------------------
export interface ResubmitCheck {
  status: string;
  version: number;
  signed_version: number | null;
  signed_at: string | null;
}

/**
 * A submitted report changed since it was signed: a content save moved its version past signed_version, or a photo
 * (including a removed one) changed after the signing. Its stored PDF is then out of date: never downloaded or emailed
 * as current, and "Update & resubmit" is the way on.
 */
export function needsResubmit(r: ResubmitCheck, photos: readonly { updated_at: string }[]): boolean {
  if (r.status !== 'submitted') return false;
  if (r.signed_version === null || r.version !== r.signed_version || r.signed_at === null) return true;
  const signed = Date.parse(r.signed_at);
  return photos.some((p) => Date.parse(p.updated_at) > signed);
}

/** A report holds at most this many photos (add_daily_photo refuses the next one). */
export const PHOTOS_PER_REPORT_MAX = 40;

/** The named values a daily report filename pattern can use ({Project}, {Job}, {Author}, {Company}, {Label}). */
export function dailyFilenameFields(h: DailyHeader): Record<string, string> {
  return { Project: h.project_name, Job: h.project_number, Author: h.author_name, Company: h.author_company, Label: h.label };
}

/** Stored report PDFs always end in .pdf, whether or not the pattern says so. */
export function asPdfName(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
