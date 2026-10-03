// Daily report forms (SPEC §8.3, §13.1): the built-in forms people write their dailies on, whatever their company kind
// and trade. Which one is data, never a company id or a role name in code: a person's daily setup
// (daily_setups.report_type) names the form they write; until they pick one, their role's form (roles.daily_form, read
// through my_daily_form) and then their job's company form (orgs.settings.report_generator) are the default. Each entry
// lists the job values typed once in Setup (settings.locked), the fields and tables filled each day (content.fields,
// content.tables) and the defaults its setup starts with. Its PDF builder lives with the edge functions (pdf/vis.ts for
// the VIS form; pdf/gcDaily.ts for the forms made of fields and tables). Pure, no imports: the browser reads this file too.
//
// A company's own uploaded form (SPEC §8.3, "learned") is the next kind of entry: its fields and tables as data per
// company, its page drawn from the uploaded PDF. Not built yet; this registry and Setup's form picker are where it plugs in.

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
  /** Picked with buttons, any number, stored joined by ", " (the weather's conditions). */
  options?: readonly string[];
  /** Printed after the value ("°F"). */
  unit?: string;
}

/** The number cells: summed on the PDF, and cleared when a row comes back on the next report (SQL daily_carryover). */
export const NUMBER_CELLS = ['count', 'hours'] as const;

export interface FormColumn {
  /** The cell's key in a row (content.tables[table][i].cells[key]). A number column's key is one of NUMBER_CELLS. */
  key: string;
  label: string;
  max: number;
  /** A count or hours: a number box, summed on the PDF. */
  number?: true;
  /** A long value: a two-line box. */
  multiline?: true;
  /** Its share of the row's width (default 1). */
  w?: number;
}

export interface FormTable {
  /** content.tables[key]. */
  key: string;
  label: string;
  columns: readonly FormColumn[];
  /** Rows come back on the next report with their numbers cleared (manpower, crew, equipment). */
  carry?: true;
  /** Filled from what the job knows that day (daily_day_facts): sign-ins, deliveries, inspections. */
  source?: 'signins' | 'deliveries' | 'inspections';
}

export interface ReportForm {
  /** The name in Setup's form picker. */
  name: string;
  /** Job values: typed once in Setup, printed on every report. */
  locked: readonly FormField[];
  /** Filled each day: the short ones first (one card), the long ones after the tables. */
  daily: readonly FormField[];
  /** The daily field the setup's standing note fills on every new report. */
  standing: string;
  /** The setup's report name and filename pattern when it is made. */
  label: string;
  filenamePattern: string;
  /** The short daily fields' card (default "Daily activity"). */
  shortTitle?: string;
  /** Filled each day, between the short fields and the long ones. */
  tables?: readonly FormTable[];
  /** The daily field that gets "Tailgate held: ..." from that day's closed safety meetings. */
  safetyField?: string;
  /** The PDF prints the report's number, so it is rendered once the number is given (like the work log). */
  numbered?: true;
  /** Photos take a description (the VIS form's Photo Analysis pages). */
  describePhotos?: true;
}

export const REPORT_FORMS = {
  // MDR's VIS Inspector's Daily Report, rebuilt as a pure PDF builder (pdf/vis.ts).
  vis_daily: {
    name: 'VIS daily report',
    label: 'Daily Report',
    filenamePattern: 'DR_{#}_{Project_}_{YYYY-MM-DD}',
    standing: 'ior_notes',
    describePhotos: true,
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
  // The superintendent's daily (research §3.1: MasterSpec 01 32 00 "Daily Construction Reports", plus common practice).
  gc_daily: {
    name: 'Superintendent daily',
    label: 'Daily Report',
    filenamePattern: 'Daily Report {#} {Project} {MM-DD-YYYY}',
    standing: 'notes',
    shortTitle: 'Weather',
    safetyField: 'safety',
    numbered: true,
    locked: [],
    daily: [
      { key: 'conditions', label: 'Conditions', max: 120, options: ['Clear', 'Cloudy', 'Rain', 'Wind', 'Fog', 'Heat', 'Cold'] },
      { key: 'high', label: 'High', max: 6, unit: '°F' },
      { key: 'low', label: 'Low', max: 6, unit: '°F' },
      { key: 'delays', label: 'Delays / issues', max: 20000, multiline: true },
      { key: 'safety', label: 'Safety', max: 20000, multiline: true },
      { key: 'notes', label: 'Notes', max: 20000, multiline: true },
    ],
    tables: [
      {
        key: 'manpower',
        label: 'Manpower',
        carry: true,
        source: 'signins',
        columns: [
          { key: 'company', label: 'Company', max: 120, w: 3 },
          { key: 'trade', label: 'Trade', max: 80, w: 2 },
          { key: 'count', label: 'Count', max: 6, number: true },
          { key: 'hours', label: 'Hours', max: 8, number: true },
        ],
      },
      {
        key: 'equipment',
        label: 'Equipment',
        carry: true,
        columns: [
          { key: 'equipment', label: 'Equipment', max: 120, w: 3 },
          { key: 'company', label: 'Company', max: 120, w: 2 },
          { key: 'hours', label: 'Hours', max: 8, number: true },
        ],
      },
      {
        key: 'work',
        label: 'Work performed',
        columns: [
          { key: 'company', label: 'Company', max: 120, w: 2 },
          { key: 'area', label: 'Area', max: 120, w: 2 },
          { key: 'work', label: 'Work', max: 4000, multiline: true, w: 5 },
        ],
      },
      {
        key: 'deliveries',
        label: 'Deliveries',
        source: 'deliveries',
        columns: [
          { key: 'time', label: 'Time', max: 20, w: 1.3 },
          { key: 'company', label: 'Company', max: 120, w: 2 },
          { key: 'material', label: 'Material', max: 1000, w: 4 },
        ],
      },
      {
        key: 'inspections',
        label: 'Inspections',
        source: 'inspections',
        columns: [
          { key: 'time', label: 'Time', max: 20, w: 1.3 },
          { key: 'inspection', label: 'Inspection', max: 1000, w: 4 },
          { key: 'result', label: 'Result', max: 120, w: 2 },
        ],
      },
      {
        key: 'visitors',
        label: 'Visitors',
        columns: [
          { key: 'name', label: 'Name', max: 120, w: 2 },
          { key: 'company', label: 'Company', max: 120, w: 2 },
          { key: 'purpose', label: 'Purpose', max: 1000, w: 3 },
        ],
      },
    ],
  },
  // The foreman's (sub's) daily, the short one (research §3.2): the crew and their hours, the work, materials, issues.
  foreman_daily: {
    name: 'Foreman daily',
    label: 'Foreman Daily',
    filenamePattern: 'Foreman Daily {#} {Project} {MM-DD-YYYY}',
    standing: 'notes',
    numbered: true,
    locked: [],
    daily: [
      { key: 'materials', label: 'Materials', max: 20000, multiline: true },
      { key: 'issues', label: 'Delays / issues', max: 20000, multiline: true },
      { key: 'notes', label: 'Notes', max: 20000, multiline: true },
    ],
    tables: [
      {
        key: 'crew',
        label: 'Crew',
        carry: true,
        columns: [
          { key: 'name', label: 'Name', max: 120, w: 3 },
          { key: 'trade', label: 'Trade', max: 80, w: 2 },
          { key: 'hours', label: 'Hours', max: 8, number: true },
        ],
      },
      {
        key: 'work',
        label: 'Work done',
        columns: [
          { key: 'area', label: 'Area', max: 120, w: 2 },
          { key: 'work', label: 'Work', max: 4000, multiline: true, w: 5 },
          { key: 'qty', label: 'Qty', max: 40, w: 1.3 },
        ],
      },
    ],
  },
} as const satisfies Record<string, ReportForm>;

export type ReportFormId = keyof typeof REPORT_FORMS;

/** A known form id (an org setting, a role's form or a report type), or null. */
export function formIdOf(v: unknown): ReportFormId | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REPORT_FORMS, v) ? (v as ReportFormId) : null;
}

/** The company form a report type is written on, or null for the built-in work log. */
export function formOf(reportType: string): ReportForm | null {
  const id = formIdOf(reportType);
  return id === null ? null : REPORT_FORMS[id];
}

/** A form's tables (none for a form made only of fields). */
export function tablesOf(form: ReportForm): readonly FormTable[] {
  return form.tables ?? [];
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
