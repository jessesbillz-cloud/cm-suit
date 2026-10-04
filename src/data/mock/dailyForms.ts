// e2e mock of a company's daily forms (migration 0072): each form's setup and the company row's version, kept in
// sessionStorage (never module state). It behaves as the database does: only the company's admin saves, on the
// version that was read; the one schema checks the shape; the key counter is kept here, and a field of the company's
// own gets the next key, never one given before.
import { FORM_SETUP_LIMITS, addedKey, formOf, formSetupSchema, formSnapshot, reportForm, type FormSetup } from '../../lib/dailies';
import type { CompanyFormSaved, CompanyForms, DailyReportRow } from '../dailies.types';
import { DataError, conflictError } from '../errors';
import * as jobs from './jobs';
import { delay } from './store';

const KEY = 'e2e-mock-daily-forms';

function readAll(): Record<string, CompanyForms> {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, CompanyForms>);
}

/** A company's forms as saved in this test (none: every form is the standard one). */
function formsOf(orgId: string): CompanyForms {
  return readAll()[orgId] ?? { version: 1, forms: {} };
}

export async function read(orgId: string): Promise<CompanyForms> {
  await delay();
  return formsOf(orgId);
}

interface Added {
  label: string;
  long: boolean;
  table: string | null;
}

function refused(message: string): DataError {
  return new DataError(message, '22023', null);
}

/** daily_form_store: the setup as sent with the saved key counter, plus one field or column of the company's own. */
function withAdded(setup: FormSetup, seq: number, added: Added | null): FormSetup {
  if (added === null) return { ...setup, seq };
  const label = added.label.trim();
  if (label.length < 1 || label.length > FORM_SETUP_LIMITS.label) throw refused('Name it (up to 40 characters)');
  const key = addedKey(seq + 1);
  if (added.table === null) return { ...setup, seq: seq + 1, fields: [...setup.fields, { key, on: true, label, long: added.long }] };
  if (!setup.tables.some((t) => t.key === added.table)) throw refused('That table is not on the form');
  return {
    ...setup,
    seq: seq + 1,
    tables: setup.tables.map((t) => (t.key === added.table ? { ...t, columns: [...t.columns, { key, on: true, label }] } : t)),
  };
}

async function store(orgId: string, formId: string, setup: FormSetup, version: number, added: Added | null): Promise<CompanyFormSaved> {
  if (!(await jobs.isOrgAdmin(orgId))) throw new DataError("You don't have access to that.", '42501', null);
  const current = formsOf(orgId);
  if (current.version !== version) throw conflictError();
  const parsed = formSetupSchema.safeParse(withAdded(setup, current.forms[formId]?.seq ?? 0, added));
  if (!parsed.success) throw refused(parsed.error.issues[0]?.message ?? "The form setup can't be read");
  const saved: CompanyForms = { version: current.version + 1, forms: { ...current.forms, [formId]: parsed.data } };
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...readAll(), [orgId]: saved }));
  return { version: saved.version, setup: parsed.data };
}

export function save(orgId: string, formId: string, setup: FormSetup, version: number): Promise<CompanyFormSaved> {
  return store(orgId, formId, setup, version, null);
}

export function add(orgId: string, formId: string, setup: FormSetup, version: number, added: Added): Promise<CompanyFormSaved> {
  return store(orgId, formId, setup, version, added);
}

/** The form a report is signed on (submit-daily and finish_daily_submit): the company's version of a form made of
 *  fields and tables at the first signing, kept from then on; none for the work log or a fixed form. */
export async function signedOn(r: Pick<DailyReportRow, 'project_id' | 'report_type' | 'status' | 'form'>): Promise<DailyReportRow['form']> {
  const builtIn = formOf(r.report_type);
  if (builtIn === null) return null;
  const project = await jobs.project(r.project_id);
  const printed = reportForm(builtIn, r, formsOf(project.org_id).forms[r.report_type] ?? null);
  if (printed === null) throw new DataError("The form it was signed on can't be read", null, null);
  if (r.status === 'submitted' && r.form !== null) return r.form;
  return printed.companyFields ? formSnapshot(printed) : null;
}
