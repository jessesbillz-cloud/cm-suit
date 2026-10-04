// Daily report forms (SPEC §8.3, §13.1): the built-in forms people write their dailies on, whatever their company kind
// and trade. Which one is data, never a company id or a role name in code: a person's daily setup
// (daily_setups.report_type) names the form they write; until they pick one, their role's form (roles.daily_form, read
// through my_daily_form) and then their job's company form (orgs.settings.report_generator) are the default. Each entry
// lists the job values typed once in Setup (settings.locked), the fields and tables filled each day (content.fields,
// content.tables) and the defaults its setup starts with. Its PDF builder lives with the edge functions (pdf/vis.ts for
// the VIS form; pdf/gcDaily.ts for the forms made of fields and tables). Pure: zod only, no relative imports (the browser
// reads this file too).
//
// A company's own uploaded form (SPEC §8.3, "learned") is the next kind of entry: its fields and tables as data per
// company, its page drawn from the uploaded PDF. Not built yet; this registry and Setup's form picker are where it plugs in.
//
// A company's version of a built-in form (SPEC §18.1 principle 10: ticked, renamed, reordered, its own fields added) is
// the second half of this file: the ONE setup schema, and companyForm(), the ONE place the form is resolved.
import { z } from 'zod';

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
  /** Each company sets up this form's fields and tables (companyForm below). A form without it is fixed. */
  companyFields?: true;
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
    companyFields: true,
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
    companyFields: true,
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

// ---------------------------------------------------------------------------------------------------------------------
// A company's version of a form (SPEC §18.1 principle 10). Stored per company and form in
// orgs.settings.daily_forms[<form id>], saved only through save_daily_form / add_daily_form_field (migration 0072,
// which checks the same limits). None saved = our standard form, exactly. A saved setup lists every field, table and
// column of the company's form in its order, ticked or not, renamed or not; one it doesn't list (a field the standard
// form gained later) is off until the company ticks it. A key never changes: a rename is only a label, so saved
// reports keep their values. The company's own fields and columns get the keys "x_<n>" from the database (n counts up
// per form and is never given twice).
// ---------------------------------------------------------------------------------------------------------------------

/** The limits; the database checks the same (daily_form_setup_problem). */
export const FORM_SETUP_LIMITS = { label: 40, addedFields: 12, addedColumns: 3 } as const;

/** What a company's own field or column holds, and its column's share of the row. */
const ADDED_SHORT_MAX = 120;
const ADDED_LONG_MAX = 20000;
const ADDED_COLUMN_W = 2;

const ADDED_KEY = /^x_[1-9][0-9]{0,5}$/;

/** A company's own field or column. No built-in key has this shape (reportForms_test). */
export function isAddedKey(key: string): boolean {
  return ADDED_KEY.test(key);
}

/** The n-th key a form gives out. The database does the giving (add_daily_form_field); the e2e mock mirrors it. */
export function addedKey(n: number): string {
  return `x_${String(n)}`;
}

const setupKey = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Bad field key');
const setupLabel = z
  .string()
  .trim()
  .min(1, 'Name it')
  .max(FORM_SETUP_LIMITS.label, `A name holds up to ${String(FORM_SETUP_LIMITS.label)} characters`);
/** One field, table or column: ticked or not, and the company's name for it (null = ours). */
const setupEntry = { key: setupKey, on: z.boolean(), label: setupLabel.nullable().default(null) };

interface SetupEntry {
  key: string;
  on: boolean;
  label: string | null;
}

/** What is wrong with one list of entries, or null. */
function entriesProblem(entries: readonly SetupEntry[], seq: number, addedMax: number, what: string): string | null {
  if (new Set(entries.map((e) => e.key)).size !== entries.length) return `A ${what} is listed twice`;
  const added = entries.filter((e) => isAddedKey(e.key));
  if (added.some((e) => e.label === null)) return 'Name it';
  if (added.some((e) => Number(e.key.slice(2)) > seq)) return 'Bad field key';
  if (added.length > addedMax) return `Up to ${String(addedMax)} added ${what}s`;
  return null;
}

/** The ONE schema of a company's setup of a form (CLAUDE.md rule 9); its default is standardSetup(). */
export const formSetupSchema = z
  .object({
    /** How many keys this form has given out; the database keeps it. */
    seq: z.number().int().min(0).max(100000).default(0),
    /** The daily fields in the company's order. `long` says one of its own is a long text (a built-in keeps its shape). */
    fields: z.array(z.object({ ...setupEntry, long: z.boolean().default(false) })).max(40, 'Too many fields'),
    tables: z
      .array(z.object({ ...setupEntry, columns: z.array(z.object(setupEntry)).max(12, 'Too many columns') }))
      .max(20, 'Too many tables'),
  })
  .superRefine((s, ctx) => {
    const problems = [
      entriesProblem(s.fields, s.seq, FORM_SETUP_LIMITS.addedFields, 'field'),
      s.tables.some((t) => isAddedKey(t.key)) ? 'Bad table key' : entriesProblem(s.tables, s.seq, 0, 'table'),
      ...s.tables.map((t) => entriesProblem(t.columns, s.seq, FORM_SETUP_LIMITS.addedColumns, 'column')),
      s.tables.some((t) => t.on && !t.columns.some((c) => c.on)) ? 'Keep one column on' : null,
      s.fields.some((f) => f.on) || s.tables.some((t) => t.on) ? null : 'Keep one field or table on',
    ];
    for (const message of problems) {
      if (message !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
export type FormSetup = z.output<typeof formSetupSchema>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** A company's forms as stored (orgs.settings), by form id. A form with no setup, or one that can't be read, is left
 *  out: it is our standard form. */
export function companyForms(orgSettings: unknown): Record<string, FormSetup> {
  const stored = isRecord(orgSettings) ? orgSettings['daily_forms'] : null;
  if (!isRecord(stored)) return {};
  const out: Record<string, FormSetup> = {};
  for (const [id, raw] of Object.entries(stored)) {
    const parsed = formSetupSchema.safeParse(raw);
    if (parsed.success) out[id] = parsed.data;
  }
  return out;
}

/** Our standard form as a setup: everything on, in our order, under our names. The one default. */
function standardSetup(form: ReportForm): FormSetup {
  return {
    seq: 0,
    fields: form.daily.map((f) => ({ key: f.key, on: true, label: null, long: f.multiline === true })),
    tables: tablesOf(form).map((t) => ({
      key: t.key,
      on: true,
      label: null,
      columns: t.columns.map((c) => ({ key: c.key, on: true, label: null })),
    })),
  };
}

/** The listed entries that are the form's (built-in, or the company's own) in their order, then the built-in ones not
 *  listed, off. */
function complete<E extends SetupEntry>(listed: readonly E[], standard: readonly E[]): E[] {
  const builtIn = new Set(standard.map((e) => e.key));
  const kept = listed.filter((e) => builtIn.has(e.key) || isAddedKey(e.key));
  const seen = new Set(kept.map((e) => e.key));
  return [...kept, ...standard.filter((e) => !seen.has(e.key)).map((e) => ({ ...e, on: false }))];
}

/** A company's setup with every field, table and column of the form listed (what Setup shows and saves). */
export function fullSetup(form: ReportForm, setup: FormSetup | null): FormSetup {
  const standard = standardSetup(form);
  if (setup === null) return standard;
  const long = new Map(standard.fields.map((f) => [f.key, f.long]));
  const columns = new Map(standard.tables.map((t) => [t.key, t.columns]));
  return {
    seq: setup.seq,
    fields: complete(setup.fields, standard.fields).map((f) => ({ ...f, long: long.get(f.key) ?? f.long })),
    tables: complete(setup.tables.filter((t) => !isAddedKey(t.key)), standard.tables).map((t) => ({
      ...t,
      columns: complete(t.columns, columns.get(t.key) ?? []),
    })),
  };
}

/** The form with other fields and tables. Its weather title and safety field hold only while their fields are on it. */
function formWith(form: ReportForm, daily: readonly FormField[], tables: readonly FormTable[], shortTitle: string | undefined): ReportForm {
  const out: ReportForm = { ...form, daily, tables };
  delete out.shortTitle;
  delete out.safetyField;
  if (shortTitle !== undefined) out.shortTitle = shortTitle;
  if (form.safetyField !== undefined && daily.some((f) => f.key === form.safetyField)) out.safetyField = form.safetyField;
  return out;
}

/**
 * The form as this company uses it: the ONE place a built-in form and a company's setup become the form the editor
 * shows, the PDF prints and the day's facts fill. No setup (or a fixed form): the built-in form itself, unchanged.
 * The short fields' title ("Weather") is ours only while every short field is ours.
 */
export function companyForm(form: ReportForm, setup: FormSetup | null): ReportForm {
  if (!form.companyFields || setup === null) return form;
  const full = fullSetup(form, setup);
  const fields = new Map(form.daily.map((f) => [f.key, f]));
  const daily = full.fields
    .filter((e) => e.on)
    .map((e): FormField => {
      const f = fields.get(e.key);
      if (f) return e.label === null ? f : { ...f, label: e.label };
      const own: FormField = { key: e.key, label: e.label ?? '', max: e.long ? ADDED_LONG_MAX : ADDED_SHORT_MAX };
      if (e.long) own.multiline = true;
      return own;
    });
  const builtIn = new Map(tablesOf(form).map((t) => [t.key, t]));
  const tables = full.tables
    .filter((e) => e.on)
    .flatMap((e): FormTable[] => {
      const t = builtIn.get(e.key);
      if (!t) return [];
      const cols = new Map(t.columns.map((c) => [c.key, c]));
      const columns = e.columns
        .filter((c) => c.on)
        .map((c): FormColumn => {
          const col = cols.get(c.key);
          if (col) return c.label === null ? col : { ...col, label: c.label };
          return { key: c.key, label: c.label ?? '', max: ADDED_SHORT_MAX, w: ADDED_COLUMN_W };
        });
      return columns.length === 0 ? [] : [{ ...t, label: e.label ?? t.label, columns }];
    });
  const ours = daily.every((f) => f.multiline === true || fields.has(f.key));
  return formWith(form, daily, tables, ours ? form.shortTitle : undefined);
}

// What a signed report keeps of its form (daily_reports.form, written by finish_daily_submit): the fields and tables it
// was signed on, so its PDF never changes because the company changed its form afterwards.
const savedLabel = z.string().max(80);
const savedMax = z.number().int().min(1).max(20000);
const savedFieldSchema = z.object({
  key: setupKey,
  label: savedLabel,
  max: savedMax,
  multiline: z.literal(true).optional(),
  unit: z.string().max(10).optional(),
  options: z.array(z.string().max(40)).max(20).optional(),
});
const savedColumnSchema = z.object({
  key: setupKey,
  label: savedLabel,
  max: savedMax,
  number: z.literal(true).optional(),
  multiline: z.literal(true).optional(),
  w: z.number().positive().max(20).optional(),
});
const savedTableSchema = z.object({
  key: setupKey,
  label: savedLabel,
  columns: z.array(savedColumnSchema).min(1).max(12),
  carry: z.literal(true).optional(),
  source: z.enum(['signins', 'deliveries', 'inspections']).optional(),
});
const savedFormSchema = z.object({
  shortTitle: z.string().max(80).optional(),
  daily: z.array(savedFieldSchema).max(40),
  tables: z.array(savedTableSchema).max(20),
});
export type SavedForm = z.output<typeof savedFormSchema>;

/** What a report keeps of the form it is signed on, as plain JSON (no key without a value, so it hashes the same when
 *  read back). */
export function formSnapshot(form: ReportForm): SavedForm {
  const plain: unknown = JSON.parse(JSON.stringify({ shortTitle: form.shortTitle, daily: form.daily, tables: tablesOf(form) }));
  return savedFormSchema.parse(plain);
}

function savedField(f: SavedForm['daily'][number]): FormField {
  const out: FormField = { key: f.key, label: f.label, max: f.max };
  if (f.multiline) out.multiline = true;
  if (f.unit !== undefined) out.unit = f.unit;
  if (f.options !== undefined) out.options = f.options;
  return out;
}

function savedColumn(c: SavedForm['tables'][number]['columns'][number]): FormColumn {
  const out: FormColumn = { key: c.key, label: c.label, max: c.max };
  if (c.number) out.number = true;
  if (c.multiline) out.multiline = true;
  if (c.w !== undefined) out.w = c.w;
  return out;
}

function savedTable(t: SavedForm['tables'][number]): FormTable {
  const out: FormTable = { key: t.key, label: t.label, columns: t.columns.map(savedColumn) };
  if (t.carry) out.carry = true;
  if (t.source !== undefined) out.source = t.source;
  return out;
}

/**
 * The form a report is written and printed on. A draft follows the company's form as it is now. A submitted report
 * keeps the form it was signed on (one signed before companies could set up their forms was signed on the standard
 * form), also while it is being updated and resubmitted. Null: the saved form can't be read.
 */
export function reportForm(form: ReportForm, report: { status: string; form: unknown }, setup: FormSetup | null): ReportForm | null {
  if (!form.companyFields) return form;
  if (report.status !== 'submitted') return companyForm(form, setup);
  if (report.form === null || report.form === undefined) return form;
  const saved = savedFormSchema.safeParse(report.form);
  if (!saved.success) return null;
  return formWith(form, saved.data.daily.map(savedField), saved.data.tables.map(savedTable), saved.data.shortTitle);
}
