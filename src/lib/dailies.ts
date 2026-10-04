// Daily reports: the ONE content schema, setup settings schema (defaults) and shared rules live with the edge functions
// (supabase/functions/_shared/dailies.ts), and so do the forms (_shared/reportForms.ts), so the browser and the server
// read a report the same way; a company's version of a form (its fields ticked, renamed, reordered, its own added) is
// resolved there too (reportForms companyForm / reportForm). Here: which form a person writes, and a new setup's
// settings for it.
import { DAILY_REPORT_TYPE, DAILY_SETTINGS_DEFAULTS, type DailySettings } from '../../supabase/functions/_shared/dailies';
import { formIdOf, formOf, newLockedValues, REPORT_FORMS, type KnownJob } from '../../supabase/functions/_shared/reportForms';

export {
  DAILY_REPORT_TYPE,
  DAILY_SETTINGS_DEFAULTS,
  NOTE_SECTIONS,
  asPdfName,
  dailyContentSchema,
  dailyFilenameFields,
  dailyHeaderSchema,
  dailySettingsSchema,
  needsResubmit,
  parseDailySettings,
  type DailyContent,
  type DailyHeader,
  type DailySettings,
  type NoteKey,
  type TableRow,
  type WorkRow,
} from '../../supabase/functions/_shared/dailies';
export {
  FORM_SETUP_LIMITS,
  addedKey,
  companyForms,
  dailyValues,
  formOf,
  formSetupSchema,
  formSnapshot,
  fullSetup,
  isAddedKey,
  reportForm,
  tablesOf,
  type FormColumn,
  type FormField,
  type FormSetup,
  type FormTable,
  type ReportForm,
} from '../../supabase/functions/_shared/reportForms';

/** The forms Setup offers: the built-in work log, then each form in the registry. */
export const FORM_CHOICES: readonly { value: string; label: string }[] = [
  { value: DAILY_REPORT_TYPE, label: 'Work log' },
  ...Object.entries(REPORT_FORMS).map(([value, f]) => ({ value, label: f.name })),
];

/** The form a person writes on a job: the setup they chose last; else their role's form (roles.daily_form, e.g. the
 *  superintendent's daily); else their company's form (orgs.settings report_generator, e.g. an inspector company's
 *  VIS form); else the work log. Only known forms count. */
export function activeReportType(
  setups: readonly { report_type: string; chosen_at: string }[],
  roleForm: string | null,
  orgGenerator: string | null,
): string {
  const chosen = [...setups].sort((a, b) => b.chosen_at.localeCompare(a.chosen_at))[0];
  return chosen?.report_type ?? formIdOf(roleForm) ?? formIdOf(orgGenerator) ?? DAILY_REPORT_TYPE;
}

/** A new setup's settings for a form: the one set of defaults, plus a company form's own name, filename and job values
 *  prefilled from what the job knows. */
export function newSetupSettings(reportType: string, known: KnownJob): DailySettings {
  const base: DailySettings = {
    ...DAILY_SETTINGS_DEFAULTS,
    schedule_days: [...DAILY_SETTINGS_DEFAULTS.schedule_days],
    recipients: [],
    locked: {},
  };
  const form = formOf(reportType);
  if (!form) return base;
  return { ...base, label: form.label, filename_pattern: form.filenamePattern, locked: newLockedValues(form, known) };
}
