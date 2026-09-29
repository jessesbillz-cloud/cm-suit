// Company form generators (SPEC §8.3): built-in builders for a company's own daily report form. Which one a job uses is
// data, never a company id in code: orgs.settings.report_generator names the job's default, and a person's daily setup
// (daily_setups.report_type) names the form they write. Each entry lists the job values typed once in Setup
// (settings.locked), the fields filled each day (content.fields) and the defaults its setup starts with. Its PDF builder
// lives with the edge functions (_shared/pdf/<id>.ts). Pure, no imports: the browser reads this file too.

export interface FormField {
  /** Where the value lives: settings.locked[key] (job values) or content.fields[key] (daily values). */
  key: string;
  /** As the form prints it. */
  label: string;
  /** The longest value the form prints; the editor stops there. */
  max: number;
  multiline?: true;
  /** Filled from what the job already knows when the setup is made. */
  prefill?: 'project_name' | 'project_number' | 'author_name' | 'dsa';
}

export interface ReportForm {
  /** The name in Setup's form picker. */
  name: string;
  /** Job values: typed once in Setup, printed on every report. */
  locked: readonly FormField[];
  /** Filled each day. */
  daily: readonly FormField[];
  /** The daily field the setup's standing note fills on every new report. */
  standing: string;
  /** The setup's report name and filename pattern when it is made. */
  label: string;
  filenamePattern: string;
}

export const REPORT_FORMS = {
  // MDR's VIS Inspector's Daily Report, rebuilt as a pure PDF builder (pdf/vis.ts).
  vis_daily: {
    name: 'VIS daily report',
    label: 'Daily Report',
    filenamePattern: 'DR_{#}_{Project_}_{YYYY-MM-DD}',
    standing: 'ior_notes',
    locked: [
      { key: 'project_name', label: 'Project Name', max: 120, prefill: 'project_name' },
      { key: 'project_no', label: 'Project No', max: 60, prefill: 'project_number' },
      { key: 'jurisdiction', label: 'Jurisdiction', max: 60, prefill: 'dsa' },
      { key: 'dsa_app', label: 'DSA App', max: 60 },
      { key: 'dsa_file', label: 'DSA File #', max: 60 },
      { key: 'ior', label: 'IOR', max: 80, prefill: 'author_name' },
      { key: 'project_manager', label: 'Project Manager', max: 80 },
      { key: 'architect', label: 'Architect', max: 80 },
      { key: 'contractor', label: 'Contractor', max: 80 },
      { key: 'footer', label: 'Footer', max: 240, multiline: true },
    ],
    daily: [
      { key: 'correction_notices', label: 'Correction Notices Issued', max: 80 },
      { key: 'observation_letters', label: 'Observation Letters Issued', max: 80 },
      { key: 'irs_received', label: 'IR’s Received or Reviewed', max: 300 },
      { key: 'contractor_activity', label: 'Contractor Activity', max: 300 },
      { key: 'ior_notes', label: 'IOR Notes', max: 20000, multiline: true },
    ],
  },
} as const satisfies Record<string, ReportForm>;

export type ReportFormId = keyof typeof REPORT_FORMS;

/** A known form id (an org setting or a report type), or null. */
export function formIdOf(v: unknown): ReportFormId | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REPORT_FORMS, v) ? (v as ReportFormId) : null;
}

/** The company form a report type is written on, or null for the built-in work log. */
export function formOf(reportType: string): ReportForm | null {
  const id = formIdOf(reportType);
  return id === null ? null : REPORT_FORMS[id];
}

/** What the job already knows, for prefilling a new setup's job values. */
export interface KnownJob {
  project_name: string;
  project_number: string;
  author_name: string;
  is_dsa: boolean;
}

function prefillOf(f: FormField, known: KnownJob): string {
  if (f.prefill === 'project_name') return known.project_name;
  if (f.prefill === 'project_number') return known.project_number;
  if (f.prefill === 'author_name') return known.author_name;
  if (f.prefill === 'dsa') return known.is_dsa ? 'DSA' : '';
  return '';
}

/** A new setup's job values, prefilled from the job. */
export function newLockedValues(form: ReportForm, known: KnownJob): Record<string, string> {
  return Object.fromEntries(form.locked.map((f) => [f.key, prefillOf(f, known).slice(0, f.max)]));
}

/** The job values the form prints, every key present ('' when not typed). */
export function lockedValues(form: ReportForm, locked: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(form.locked.map((f) => [f.key, locked[f.key] ?? '']));
}

/**
 * The daily values the form prints, every key present. The standing field starts as the setup's standing note (copied
 * onto the report when it was made) until the author types in it; after that, what they typed, even if empty.
 */
export function dailyValues(form: ReportForm, fields: Readonly<Record<string, string>>, standingNote: string): Record<string, string> {
  return Object.fromEntries(form.daily.map((f) => [f.key, fields[f.key] ?? (f.key === form.standing ? standingNote : '')]));
}
