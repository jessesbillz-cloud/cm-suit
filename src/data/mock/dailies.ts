// Synthetic dailies for the e2e mock (SPEC §13.1): the mock user's setups (one per form, the one chosen last is the form
// they write), reports and photos on the sample jobs, kept in sessionStorage (not module state). Numbers are handed out
// here the way the database does: per author and form, at the first signing, never for a deleted draft.
import { buildFilename } from '../../lib/buildFilename';
import { DAILY_REPORT_TYPE, asPdfName, dailyFilenameFields, dailyHeaderSchema, parseDailySettings } from '../../lib/dailies';
import { todayInZone } from '../../lib/dates';
import type { Json } from '../database.types';
import type { DailyPhotoRow, DailyReportRow, DailySetupRow, EmailResult, SubmitResult } from '../dailies.types';
import { DataError, conflictError } from '../errors';
import * as api from './api';
import { SEED_DAILY } from './boardSeeds';
import { mockUser } from './index';
import * as jobs from './jobs';
import { delay } from './store';

interface MockDailies {
  /** The one chosen last first. */
  setups: DailySetupRow[];
  reports: DailyReportRow[];
  /** Deleted drafts: the row stays (the server-side flag), hidden from lists. */
  deleted: string[];
  photos: DailyPhotoRow[];
  /** Next number per job and form ("<job>:<report type>"; the mock has one author). */
  next: Record<string, number>;
  seq: number;
}

const KEY = 'e2e-mock-dailies';
// Sample Job B starts with someone else's submitted report #7 (a board line points at it).
const EMPTY: MockDailies = {
  setups: [],
  reports: [SEED_DAILY],
  deleted: [],
  photos: [],
  next: { [`${SEED_DAILY.project_id}:${DAILY_REPORT_TYPE}`]: 8 },
  seq: 0,
};

function read(): MockDailies {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { ...EMPTY } : { ...EMPTY, ...(JSON.parse(raw) as Partial<MockDailies>) };
}

function write(update: (s: MockDailies) => MockDailies): MockDailies {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** The mock database hands out ids. */
function newId(prefix: string): string {
  const s = write((m) => ({ ...m, seq: m.seq + 1 }));
  return `${prefix}-${String(s.seq)}`;
}

function gone(): DataError {
  return new DataError('That item no longer exists.', 'PGRST116', null);
}

/** A report that isn't deleted. */
function live(m: MockDailies, id: string): DailyReportRow | undefined {
  return m.reports.find((r) => r.id === id && !m.deleted.includes(id));
}

function numberKey(projectId: string, reportType: string): string {
  return `${projectId}:${reportType}`;
}

function setupOf(m: MockDailies, projectId: string, reportType: string): DailySetupRow | undefined {
  return m.setups.find((s) => s.project_id === projectId && s.report_type === reportType);
}

/** A setup made or chosen now goes first (the one chosen last). */
function putFirst(row: DailySetupRow): void {
  write((m) => ({ ...m, setups: [row, ...m.setups.filter((s) => s.id !== row.id)] }));
}

export async function setups(projectId: string): Promise<DailySetupRow[]> {
  await delay();
  return read().setups.filter((s) => s.project_id === projectId);
}

async function makeReport(projectId: string, reportType: string, date: string): Promise<string> {
  const project = await jobs.project(projectId);
  const settings = parseDailySettings(setupOf(read(), projectId, reportType)?.settings);
  const id = newId('mock-daily');
  const row: DailyReportRow = {
    id,
    project_id: projectId,
    author_id: mockUser().id,
    report_type: reportType,
    report_date: date,
    status: 'draft',
    number: null,
    header: {
      project_name: project.name,
      project_number: project.number ?? '',
      author_name: 'Sample User',
      author_company: 'Sample Builders',
      label: settings.label,
      timezone: project.timezone,
    },
    content: { standing_note: settings.standing_note },
    version: 1,
    signed_at: null,
    signed_version: null,
    submitted_at: null,
    pdf_file_id: null,
    filename: null,
  };
  write((m) => ({ ...m, reports: [...m.reports, row] }));
  return id;
}

function newSetup(projectId: string, reportType: string, settings: Json): DailySetupRow {
  return {
    id: newId('mock-setup'),
    project_id: projectId,
    report_type: reportType,
    settings,
    version: 1,
    chosen_at: new Date().toISOString(),
  };
}

function reportOn(m: MockDailies, projectId: string, reportType: string, date: string): DailyReportRow | undefined {
  return m.reports.find((r) => r.project_id === projectId && r.report_type === reportType && r.report_date === date);
}

export async function ensureToday(projectId: string, reportType: string, defaults: Json): Promise<string | null> {
  await delay();
  if (!setupOf(read(), projectId, reportType)) putFirst(newSetup(projectId, reportType, defaults));
  const project = await jobs.project(projectId);
  const today = todayInZone(project.timezone);
  const m = read();
  const existing = reportOn(m, projectId, reportType, today);
  if (existing) return m.deleted.includes(existing.id) ? null : existing.id;
  const settings = parseDailySettings(setupOf(m, projectId, reportType)?.settings);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (!settings.schedule_days.includes(weekday)) return null;
  return makeReport(projectId, reportType, today);
}

export async function createReport(projectId: string, reportType: string, date: string): Promise<string> {
  await delay();
  const existing = reportOn(read(), projectId, reportType, date);
  if (existing) {
    write((m) => ({ ...m, deleted: m.deleted.filter((d) => d !== existing.id) }));
    return existing.id;
  }
  return makeReport(projectId, reportType, date);
}

export async function myReports(projectId: string): Promise<DailyReportRow[]> {
  await delay();
  const m = read();
  return m.reports
    .filter((r) => r.project_id === projectId && !m.deleted.includes(r.id))
    .sort((a, b) => b.report_date.localeCompare(a.report_date));
}

export async function teamReports(projectId: string): Promise<DailyReportRow[]> {
  return (await myReports(projectId)).filter((r) => r.status === 'submitted');
}

export async function report(id: string): Promise<DailyReportRow> {
  await delay();
  const r = live(read(), id);
  if (!r) throw gone();
  return r;
}

export async function photos(reportId: string): Promise<DailyPhotoRow[]> {
  await delay();
  return read().photos.filter((p) => p.report_id === reportId);
}

export async function peek(projectId: string, reportType: string): Promise<number> {
  await delay();
  return read().next[numberKey(projectId, reportType)] ?? 1;
}

export async function saveSetup(projectId: string, reportType: string, settings: Json, version: number | null): Promise<DailySetupRow> {
  await delay();
  const current = setupOf(read(), projectId, reportType) ?? null;
  if ((current?.version ?? null) !== version) throw conflictError();
  const row: DailySetupRow = current ? { ...current, settings, version: current.version + 1 } : newSetup(projectId, reportType, settings);
  if (current) write((m) => ({ ...m, setups: m.setups.map((s) => (s.id === row.id ? row : s)) }));
  else putFirst(row);
  return row;
}

export async function chooseForm(projectId: string, reportType: string, settingsIfNew: Json): Promise<DailySetupRow> {
  await delay();
  const current = setupOf(read(), projectId, reportType);
  const row = current
    ? { ...current, version: current.version + 1, chosen_at: new Date().toISOString() }
    : newSetup(projectId, reportType, settingsIfNew);
  putFirst(row);
  return row;
}

export async function setStartNumber(projectId: string, reportType: string, start: number): Promise<number> {
  await delay();
  if (read().reports.some((r) => r.project_id === projectId && r.report_type === reportType && (r.number ?? 0) >= start)) {
    throw new DataError('That number is already used', '22023', null);
  }
  write((m) => ({ ...m, next: { ...m.next, [numberKey(projectId, reportType)]: start } }));
  return start;
}

function update(id: string, version: number, patch: Partial<DailyReportRow>): DailyReportRow {
  const r = live(read(), id);
  if (!r) throw gone();
  if (r.version !== version) throw conflictError();
  const next = { ...r, ...patch, version: r.version + 1 };
  write((m) => ({ ...m, reports: m.reports.map((x) => (x.id === id ? next : x)) }));
  return next;
}

export async function saveContent(id: string, version: number, content: Json): Promise<DailyReportRow> {
  await delay();
  return update(id, version, { content });
}

export async function deleteDraft(id: string, version: number): Promise<void> {
  await delay();
  const r = live(read(), id);
  if (!r) throw gone();
  if (r.version !== version) throw conflictError();
  if (r.number !== null) throw new DataError('A signed report cannot be deleted', '22023', null);
  write((m) => ({ ...m, deleted: [...m.deleted, id] }));
}

export async function photoFolder(projectId: string): Promise<string> {
  await delay();
  return `${projectId}-photos-mine`;
}

export async function addPhoto(reportId: string, fileId: string, rowKey: string | null, takenAt: string): Promise<DailyPhotoRow> {
  await delay();
  const row: DailyPhotoRow = {
    id: newId('mock-photo'),
    report_id: reportId,
    file_id: fileId,
    row_key: rowKey,
    caption: '',
    description: '',
    taken_at: takenAt,
    version: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  write((m) => ({ ...m, photos: [...m.photos, row] }));
  return row;
}

function updatePhoto(id: string, version: number, patch: Partial<DailyPhotoRow>): DailyPhotoRow {
  const p = read().photos.find((x) => x.id === id && x.deleted_at === null);
  if (!p) throw gone();
  if (p.version !== version) throw conflictError();
  const next = { ...p, ...patch, version: p.version + 1, updated_at: new Date().toISOString() };
  write((m) => ({ ...m, photos: m.photos.map((x) => (x.id === id ? next : x)) }));
  return next;
}

export async function savePhoto(id: string, version: number, caption: string, description: string | undefined): Promise<DailyPhotoRow> {
  await delay();
  return updatePhoto(id, version, description === undefined ? { caption } : { caption, description });
}

export async function removePhoto(id: string, version: number): Promise<void> {
  await delay();
  updatePhoto(id, version, { deleted_at: new Date().toISOString() });
}

export async function submit(id: string, version: number): Promise<SubmitResult> {
  await delay(200);
  const r = live(read(), id);
  if (!r) throw gone();
  if (r.version !== version) throw conflictError();
  const key = numberKey(r.project_id, r.report_type);
  const number = r.number ?? read().next[key] ?? 1;
  const settings = parseDailySettings(setupOf(read(), r.project_id, r.report_type)?.settings);
  const header = dailyHeaderSchema.parse(r.header);
  const filename =
    r.filename ??
    asPdfName(buildFilename(settings.filename_pattern, { number, date: r.report_date, fields: dailyFilenameFields(header) }));
  const file = await api.addUploadedFile(r.project_id, `${r.project_id}-reports-mine`, filename, 'application/pdf', 20_000);
  const signedAt = new Date().toISOString();
  write((m) => ({
    ...m,
    next: r.number === null ? { ...m.next, [key]: number + 1 } : m.next,
    reports: m.reports.map((x) =>
      x.id === id
        ? { ...x, status: 'submitted', number, filename, pdf_file_id: file.id, version: x.version + 2, signed_version: x.version + 2, signed_at: signedAt, submitted_at: x.submitted_at ?? signedAt }
        : x,
    ),
  }));
  return { id, status: 'submitted', number, filename, pdf_file_id: file.id, version: r.version + 2, signed_at: signedAt };
}

export async function email(id: string): Promise<EmailResult> {
  await delay();
  const r = live(read(), id);
  if (!r) throw gone();
  const recipients = parseDailySettings(setupOf(read(), r.project_id, r.report_type)?.settings).recipients;
  if (recipients.length === 0) throw new DataError('Add recipients in Setup', '22023', null);
  return {
    delivery_status: 'sent',
    recipients,
    deliveries: recipients.map((to) => ({ email: to, status: 'test_mode', error: null, mailto: `mailto:${to}` })),
  };
}
