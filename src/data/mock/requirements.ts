// e2e mock of Requirements (0069, 0073) with the database's rules in short form: requirements.read for the GC team, the
// inspectors, the owner rep and the architect; requirements.manage for the PM, the PE and the project admins;
// requirements.read_own for the sub and the foreman (their own company's kept lines; evidence on those, a file someone
// else attached left alone); drafts only for managers; a line's company is one on the job and its name becomes the
// words; due = trigger - notice - lead; version checks; a read of a section skips what the job has (dropped ones too).
// State lives in sessionStorage (its own key), never module state.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { todayInZone } from '../../lib/dates';
import type { RequirementStatus } from '../../lib/requirements';
import { conflictError, DataError } from '../errors';
import type { Extracted, ExtractInput, Requirement, RequirementCompany, RequirementInput, Saved, SpecSection } from '../requirements.types';
import { mockUser } from './index';
import {
  dueOf,
  foundIn,
  jobCompanies,
  line,
  MEMBER_COMPANY,
  seedRequirements,
  SPEC_FILE,
  specSections,
  TZ,
  type StoredRequirement,
} from './requirementsSeeds';
import { delay } from './store';

const KEY = 'e2e-mock-requirements';

interface RequirementsMock {
  rows: StoredRequirement[];
  seq: number;
}

function today(): string {
  return todayInZone(TZ);
}

function read(): RequirementsMock {
  const raw = window.sessionStorage.getItem(KEY);
  if (raw !== null) return JSON.parse(raw) as RequirementsMock;
  return { rows: seedRequirements(today()), seq: 100 };
}

function write(update: (s: RequirementsMock) => RequirementsMock): RequirementsMock {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function role(): string {
  return mockUser().id.replace(/^mock-user-/, '');
}

const READERS = ['pm', 'pe', 'project_admin', 'inspector_admin', 'super', 'foreman', 'safety', 'inspector', 'owner_rep', 'architect'];
const MANAGERS = ['pm', 'pe', 'project_admin', 'inspector_admin'];
/** requirements.read_own: the sub's office and the foreman. */
const OWN = ['sub', 'foreman'];

function has(cap: string): boolean {
  if (cap === 'requirements.read') return READERS.includes(role());
  if (cap === 'requirements.read_own') return OWN.includes(role());
  return cap === 'requirements.manage' && MANAGERS.includes(role());
}

/** requirement_mine: the line's company is the company of my membership, in a role that reads its own. */
function mine(r: StoredRequirement): boolean {
  return has('requirements.read_own') && r.company_org_id !== null && r.company_org_id === (MEMBER_COMPANY[role()] ?? null);
}

/** The row policy: readers (drafts for managers only), or a company its own kept lines. */
function maySee(r: StoredRequirement): boolean {
  if (r.deleted) return false;
  if (has('requirements.read') && (!r.draft || has('requirements.manage'))) return true;
  return !r.draft && mine(r);
}

function notFound(): DataError {
  return new DataError('That item no longer exists.', 'P0002', 'not_found');
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

function need(cap: string): void {
  if (!has(cap)) throw new DataError("You don't have access to that.", '42501', 'forbidden');
}

function view(r: StoredRequirement, day: string): Requirement {
  const due = dueOf(r);
  return {
    id: r.id, version: r.version, kind: r.kind, title: r.title, details: r.details, spec_section: r.spec_section, spec_title: r.spec_title,
    spec_ref: r.spec_ref, responsible: r.responsible, required: r.required, notice_days: r.notice_days, lead_days: r.lead_days,
    activity_code: r.activity_code, activity_name: r.activity_name, trigger_date: r.trigger_date, due_on: due,
    days_left: due === null ? null : differenceInCalendarDays(parseISO(due), parseISO(day)), status: r.status, status_at: r.status_at,
    evidence_note: r.evidence_note, evidence_file_id: r.evidence_file_id,
    // A file's name only when I may see the file: the folder's readers, or the one who added it.
    evidence_file_name: has('requirements.read') || r.evidence_file_by === role() ? r.evidence_file_name : null, origin: r.origin,
    draft: r.draft, source_file_id: r.source_file_id, source_file_name: r.source_file_name, source_page: r.source_page,
    source_quote: r.source_quote, created_at: r.created_at, company_org_id: r.company_org_id, mine: mine(r),
  };
}

export async function list(projectId: string): Promise<Requirement[]> {
  await delay();
  if (!has('requirements.read')) need('requirements.read_own');
  const day = today();
  return read()
    .rows.filter((r) => r.project_id === projectId && maySee(r))
    .map((r) => view(r, day))
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.spec_section.localeCompare(b.spec_section));
}

export async function sections(projectId: string): Promise<SpecSection[]> {
  await delay();
  need('requirements.manage');
  return specSections(projectId);
}

export async function companies(projectId: string): Promise<RequirementCompany[]> {
  await delay();
  need('requirements.manage');
  return jobCompanies(projectId);
}

/** The line, held for a change, with its version checked (null: Undo of a remove, which takes none). */
function locked(s: RequirementsMock, id: string, version: number | null): StoredRequirement {
  need('requirements.manage');
  const r = s.rows.find((x) => x.id === id);
  if (!r) throw notFound();
  if (version !== null && r.version !== version) throw conflictError();
  return r;
}

function change(id: string, version: number | null, patch: (r: StoredRequirement) => Partial<StoredRequirement>): Saved {
  let out: Saved = { id, version: 0 };
  write((s) => {
    const r = locked(s, id, version);
    const next = { ...r, ...patch(r), version: r.version + 1 };
    out = { id, version: next.version };
    return { ...s, rows: s.rows.map((x) => (x.id === id ? next : x)) };
  });
  return out;
}

export async function save(projectId: string, v: RequirementInput): Promise<Saved> {
  await delay();
  need('requirements.manage');
  if (v.title.trim() === '') throw new DataError('Name it.', '22023', 'Name it.');
  const company = v.companyOrgId === null ? null : jobCompanies(projectId).find((c) => c.org_id === v.companyOrgId);
  if (company === undefined) throw new DataError('Pick a company on this job.', '22023', 'Pick a company on this job.');
  const fields = {
    kind: v.kind, title: v.title.trim().replace(/\s+/g, ' '), details: v.details.trim(), spec_section: v.specSection,
    spec_title: v.specTitle, spec_ref: v.specRef, responsible: company?.name ?? v.responsible, company_org_id: v.companyOrgId,
    required: v.required, notice_days: v.noticeDays, lead_days: v.leadDays, activity_code: v.activityCode,
    activity_name: v.activityName, trigger_date: v.triggerDate,
  };
  if (v.id !== null) return change(v.id, v.version, () => fields);
  const same = read().rows.find((r) => r.key === v.key);
  if (same) return { id: same.id, version: same.version };
  let out: Saved = { id: '', version: 1 };
  write((s) => {
    const id = `mock-req-${String(s.seq)}`;
    out = { id, version: 1 };
    return { rows: [...s.rows, line({ id, project_id: projectId, key: v.key, ...fields })], seq: s.seq + 1 };
  });
  return out;
}

export async function setStatus(id: string, version: number, status: RequirementStatus): Promise<Saved> {
  await delay();
  const r = read().rows.find((x) => x.id === id);
  if (r?.draft) throw new DataError('Keep the draft first.', '22023', 'Keep the draft first.');
  return change(id, version, () => ({ status }));
}

export async function keep(id: string, version: number, keepIt: boolean): Promise<Saved> {
  await delay();
  return change(id, version, () => ({ draft: !keepIt }));
}

export async function remove(id: string, removed: boolean): Promise<number> {
  await delay();
  return change(id, null, () => ({ deleted: removed })).version;
}

/** The evidence fields after a write: a new file is the writer's; the same file keeps who added it. */
function evidencePatch(r: StoredRequirement, note: string, fileId: string | null): Partial<StoredRequirement> {
  return {
    evidence_note: note.trim(),
    evidence_file_id: fileId,
    evidence_file_name: fileId === null ? null : fileId === r.evidence_file_id ? r.evidence_file_name : `Sample evidence ${fileId.slice(-4)}.jpg`,
    evidence_file_by: fileId === null ? null : fileId === r.evidence_file_id ? r.evidence_file_by : role(),
  };
}

export async function evidence(id: string, version: number, note: string, fileId: string | null): Promise<Saved> {
  await delay();
  return change(id, version, (r) => evidencePatch(r, note, fileId));
}

/** requirement_evidence_own: my company's own kept line, with the version; a file someone else attached stays. */
export async function evidenceOwn(id: string, version: number, note: string, fileId: string | null): Promise<Saved> {
  await delay();
  let out: Saved = { id, version: 0 };
  write((s) => {
    const r = s.rows.find((x) => x.id === id);
    if (!r || r.deleted || r.draft || !mine(r)) throw notFound();
    if (fileId !== r.evidence_file_id && r.evidence_file_id !== null && r.evidence_file_by !== role()) {
      throw new DataError('Someone else added that file.', '22023', 'Someone else added that file.');
    }
    if (r.version !== version) throw conflictError();
    const next = { ...r, ...evidencePatch(r, note, fileId), version: r.version + 1 };
    out = { id, version: next.version };
    return { ...s, rows: s.rows.map((x) => (x.id === id ? next : x)) };
  });
  return out;
}

export async function extract(projectId: string, v: ExtractInput): Promise<Extracted> {
  await delay(400);
  need('requirements.manage');
  const found = foundIn(v.source === 'file' ? v.firstPage : null, v.source === 'text' ? v.text : '');
  let added = 0;
  let skipped = 0;
  write((s) => {
    const rows = [...s.rows];
    let seq = s.seq;
    for (const f of found) {
      const dup = rows.some((r) => r.project_id === projectId && r.kind === f.kind
        && ((r.title.toLowerCase() === f.title.toLowerCase() && r.spec_section === f.section) || (f.quote !== '' && r.source_quote === f.quote)));
      if (dup) {
        skipped++;
        continue;
      }
      rows.push(line({
        id: `mock-req-${String(seq++)}`, project_id: projectId, kind: f.kind, title: f.title, spec_section: f.section,
        spec_title: f.sectionTitle, spec_ref: f.ref, responsible: f.responsible, required: f.required, notice_days: f.notice,
        activity_name: f.activity, origin: 'ai', draft: true, source_file_id: v.source === 'file' ? SPEC_FILE : null,
        source_file_name: v.source === 'file' ? 'Sample Spec Book Vol 2.pdf' : null, source_page: f.page, source_quote: f.quote,
      }));
      added++;
    }
    return { rows, seq };
  });
  return { found: found.length, added, skipped, unquoted: 0, model: 'mock-model' };
}

export async function folder(projectId: string, own: boolean): Promise<string> {
  await delay();
  need(own ? 'requirements.read_own' : 'requirements.manage');
  return `${projectId}-requirements`;
}

export async function fileBlob(fileId: string): Promise<{ blob: Blob; filename: string }> {
  await delay();
  return { blob: new Blob([`Synthetic e2e evidence ${fileId}\n`], { type: 'image/jpeg' }), filename: `Sample evidence ${fileId.slice(-4)}.jpg` };
}
