// e2e mock of Schedule (0062) with the database's rules in short form: schedule.read for every mock user but the
// bidder, the requester and the visitor; schedule.manage for the PM and the superintendent; drafts only to managers;
// publishing needs the data date (not older than the current one's) and a start on every row, takes the next number and
// supersedes the current one; Undo of a publish by the publisher; a row removed or a draft discarded with Undo. An
// upload is "read" here: a CSV by its columns, anything else as a fixed sample. State lives in sessionStorage (its own
// key), never module state.
import { todayInZone } from '../../lib/dates';
import { conflictError, DataError } from '../errors';
import type { Activity, ActivityInput, DraftRow, Imported, Published, ScheduleStatus, SourceKind, Version, VersionRow } from '../schedule.types';
import { mockUser } from './index';
import { draftRows as sampleRows, FILE_ROWS, READ_ROWS, seedSchedules, shift, TZ, type StoredActivity, type StoredVersion } from './scheduleSeeds';
import { delay } from './store';

const KEY = 'e2e-mock-schedule';

interface ScheduleMock {
  versions: StoredVersion[];
  activities: StoredActivity[];
  seq: number;
}

function today(): string {
  return todayInZone(TZ);
}

function read(): ScheduleMock {
  const raw = window.sessionStorage.getItem(KEY);
  if (raw !== null) return JSON.parse(raw) as ScheduleMock;
  return { ...seedSchedules(today(), Date.now()), seq: 100 };
}

function write(update: (s: ScheduleMock) => ScheduleMock): ScheduleMock {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function role(): string {
  return mockUser().id.replace(/^mock-user-/, '');
}

function has(cap: string): boolean {
  const r = role();
  if (['bidder', 'requester', 'anon', 'newcomer'].includes(r)) return false;
  if (cap === 'schedule.read') return true;
  return cap === 'schedule.manage' && ['pm', 'super', 'user'].includes(r);
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

function need(cap: string): void {
  if (!has(cap)) throw new DataError("You don't have access to that.", '42501', 'forbidden');
}

function seen(v: StoredVersion): boolean {
  return (v.status !== 'draft' && !v.deleted) || has('schedule.manage');
}

function versionOf(s: ScheduleMock, id: string): StoredVersion {
  const v = s.versions.find((x) => x.id === id);
  if (!v || !has('schedule.read') || !seen(v)) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
  return v;
}

function draftOf(s: ScheduleMock, id: string): StoredVersion {
  need('schedule.manage');
  const v = versionOf(s, id);
  if (v.status !== 'draft') throw new DataError('This schedule is published.', '22023', null);
  if (v.deleted) throw new DataError('This draft was discarded.', '22023', null);
  return v;
}

function live(s: ScheduleMock, versionId: string): StoredActivity[] {
  return s.activities.filter((a) => a.version_id === versionId && !a.deleted);
}

function rowOf(v: StoredVersion, s: ScheduleMock): VersionRow {
  return {
    id: v.id, number: v.number, status: v.status, source_kind: v.source_kind, title: v.title, data_date: v.data_date, file_id: v.file_id,
    file_name: v.file_name, created_at: v.created_at, created_by_name: v.created_by_name, published_at: v.published_at,
    published_by_name: v.published_by_name, activities: live(s, v.id).length, version: v.version,
  };
}

function toActivity(a: StoredActivity): Activity {
  return {
    id: a.id, version_id: a.version_id, activity_code: a.activity_code, name: a.name, wbs: a.wbs, area: a.area, trade: a.trade,
    start_date: a.start_date, finish_date: a.finish_date, actual_start: a.actual_start, actual_finish: a.actual_finish, percent: a.percent,
    is_milestone: a.is_milestone, csi_division: a.csi_division, sort: a.sort,
  };
}

function currentOf(s: ScheduleMock, projectId: string): StoredVersion | undefined {
  return s.versions.find((v) => v.project_id === projectId && v.status === 'current');
}

export async function status(projectId: string): Promise<ScheduleStatus> {
  await delay();
  need('schedule.read');
  const s = read();
  const cur = currentOf(s, projectId);
  const t = today();
  const days = cur?.data_date ? Math.round((Date.parse(t) - Date.parse(cur.data_date)) / 86_400_000) : null;
  return {
    today: t, current_id: cur?.id ?? null, number: cur?.number ?? null, data_date: cur?.data_date ?? null, days_old: days,
    update_due: days !== null && days > 35,
    drafts: has('schedule.manage') ? s.versions.filter((v) => v.project_id === projectId && v.status === 'draft' && !v.deleted).length : 0,
  };
}

const ORDER = { draft: 0, current: 1, superseded: 2 } as const;

export async function versions(projectId: string): Promise<VersionRow[]> {
  await delay();
  need('schedule.read');
  const s = read();
  return s.versions
    .filter((v) => v.project_id === projectId && !v.deleted && seen(v))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.number ?? Infinity) - (a.number ?? Infinity) || b.created_at.localeCompare(a.created_at))
    .map((v) => rowOf(v, s));
}

export async function version(versionId: string): Promise<Version> {
  await delay();
  const s = read();
  const v = versionOf(s, versionId);
  const rows = live(s, v.id);
  return {
    ...rowOf(v, s), project_id: v.project_id, model: v.model, warnings: v.warnings, need_dates: rows.filter((a) => a.start_date === null).length,
    unsure: rows.filter((a) => a.unsure).length, discarded: v.deleted, can_manage: has('schedule.manage'),
    can_undo: v.status === 'current' && v.published_by === mockUser().id && v.published_at !== null && Date.now() - Date.parse(v.published_at) < 15 * 60_000,
  };
}

function byStart(a: StoredActivity, b: StoredActivity): number {
  return (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') || a.sort - b.sort;
}

export async function current(projectId: string): Promise<Activity[]> {
  await delay();
  if (!has('schedule.read')) return [];
  const s = read();
  const cur = currentOf(s, projectId);
  return cur ? live(s, cur.id).sort(byStart).map(toActivity) : [];
}

export async function draftRows(versionId: string): Promise<DraftRow[]> {
  await delay();
  const s = read();
  versionOf(s, versionId);
  return live(s, versionId)
    .sort((a, b) => a.sort - b.sort)
    .map((a): DraftRow => ({ ...toActivity(a), unsure: a.unsure, source_ref: a.source_ref, version: a.version }));
}

export async function activity(activityId: string): Promise<Activity> {
  await delay();
  const s = read();
  const a = s.activities.find((x) => x.id === activityId);
  if (!a) throw new DataError('That item no longer exists.', 'PGRST116', null);
  versionOf(s, a.version_id);
  return toActivity(a);
}

export function folder(projectId: string): string {
  return `${projectId}-schedule`;
}

function kindOf(name: string): SourceKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (ext === 'xer') return 'xer';
  if (ext === 'xml') return 'msp_xml';
  if (ext === 'csv') return 'csv';
  if (ext === 'pdf') return 'pdf';
  return 'photo';
}

/** M/D/YY, M/D/YYYY or YYYY-MM-DD; else none. */
function csvDay(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const y = (m[3] ?? '').length === 2 ? `20${m[3] ?? ''}` : (m[3] ?? '');
  return `${y}-${(m[1] ?? '').padStart(2, '0')}-${(m[2] ?? '').padStart(2, '0')}`;
}

/** A CSV the short way (the server's reader is _shared/schedule/csv.ts): the header row, then one row per line. */
function csvRows(text: string, versionId: string, projectId: string): StoredActivity[] {
  const lines = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
  const at = lines.findIndex((l) => l.some((c) => /name|activity|task/i.test(c)));
  const head = (lines[at] ?? []).map((c) => c.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const [name, code, start, finish, area, trade] = [col(/name|^activity$|task/), col(/id$|code/), col(/start/), col(/finish|end/), col(/area|location/), col(/trade|responsible|sub/)];
  return lines.slice(at + 1).filter((l) => (l[name] ?? '') !== '').map((l, i) => ({
    id: `${versionId}-a${String(i + 1)}`, version_id: versionId, project_id: projectId, activity_code: code >= 0 ? l[code] || null : null,
    name: l[name] ?? '', wbs: null, area: area >= 0 ? l[area] || null : null, trade: trade >= 0 ? l[trade] || null : null,
    start_date: csvDay(l[start]), finish_date: csvDay(l[finish]) ?? csvDay(l[start]), actual_start: null, actual_finish: null, percent: null,
    is_milestone: false, csi_division: null, sort: i + 1, unsure: false, source_ref: `row ${String(at + i + 2)}`, version: 1, deleted: false,
  }));
}

export async function importFile(projectId: string, file: File): Promise<Imported> {
  need('schedule.manage');
  const kind = kindOf(file.name);
  const text = kind === 'csv' ? await file.text() : '';
  await delay();
  let made: StoredVersion | undefined;
  write((s) => {
    const id = `mock-sched-${String(s.seq)}`;
    const t = today();
    const rows =
      kind === 'csv' ? csvRows(text, id, projectId) : kind === 'xer' || kind === 'msp_xml' ? sampleRows(id, projectId, FILE_ROWS, t) : sampleRows(id, projectId, READ_ROWS, t, [1]);
    if (rows.length === 0) throw new DataError('No activities in this file.', '22023', 'empty');
    made = {
      id, project_id: projectId, number: null, status: 'draft', source_kind: kind, title: kind === 'xer' ? 'Sample Master Schedule' : null,
      data_date: kind === 'xer' || kind === 'msp_xml' ? shift(t, -1) : null, file_id: `${id}-file`, file_name: file.name,
      created_at: new Date().toISOString(), created_by_name: 'Sol Sample', published_at: null, published_by_name: null, activities: rows.length,
      version: 1, model: kind === 'pdf' || kind === 'photo' ? 'sample-model' : null, warnings: kind === 'photo' ? ['Sample: one row\'s dates were read off its bar.'] : [],
      deleted: false, created_by: mockUser().id, published_by: null, supersedes_id: null,
    };
    return { versions: [...s.versions, made], activities: [...s.activities, ...rows], seq: s.seq + 1 };
  });
  if (!made) throw new DataError('The server answered nothing.', null, null);
  return { version_id: made.id, source_kind: kind, rows: made.activities, warnings: made.warnings };
}

export async function saveDraft(versionId: string, expected: number, title: string, dataDate: string | null): Promise<number> {
  await delay();
  let next = 0;
  write((s) => {
    const v = draftOf(s, versionId);
    if (v.version !== expected) throw conflictError();
    next = v.version + 1;
    const patched = { ...v, title: title.trim() === '' ? null : title.trim(), data_date: dataDate, version: next };
    return { ...s, versions: s.versions.map((x) => (x.id === v.id ? patched : x)) };
  });
  return next;
}

export async function saveActivity(id: string, expected: number, input: ActivityInput): Promise<number> {
  await delay();
  let next = 0;
  write((s) => {
    const a = s.activities.find((x) => x.id === id && !x.deleted);
    if (!a) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
    draftOf(s, a.version_id);
    if (a.version !== expected) throw conflictError();
    if (input.name.trim() === '') throw new DataError('Add a name.', '23514', null);
    if (input.start && input.finish && input.finish < input.start) throw new DataError('The finish is before the start.', '23514', null);
    next = a.version + 1;
    const blank = (v: string) => (v.trim() === '' ? null : v.trim());
    const patched: StoredActivity = {
      ...a, activity_code: blank(input.code), name: input.name.trim(), wbs: blank(input.wbs), area: blank(input.area), trade: blank(input.trade),
      start_date: input.start, finish_date: input.finish, is_milestone: input.isMilestone, unsure: false, version: next,
    };
    return { ...s, activities: s.activities.map((x) => (x.id === id ? patched : x)) };
  });
  return next;
}

export async function removeActivity(id: string, removed: boolean): Promise<void> {
  await delay();
  write((s) => {
    const a = s.activities.find((x) => x.id === id);
    if (!a) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
    draftOf(s, a.version_id);
    return { ...s, activities: s.activities.map((x) => (x.id === id ? { ...x, deleted: removed } : x)) };
  });
}

export async function discard(id: string, discarded: boolean): Promise<void> {
  await delay();
  write((s) => {
    need('schedule.manage');
    const v = versionOf(s, id);
    if (v.status !== 'draft') throw new DataError('This schedule is published.', '22023', null);
    return { ...s, versions: s.versions.map((x) => (x.id === id ? { ...x, deleted: discarded } : x)) };
  });
}

export async function publish(id: string, expected: number): Promise<Published> {
  await delay();
  let out: Published = { number: 0, version: 0 };
  write((s) => {
    const v = draftOf(s, id);
    if (v.version !== expected) throw conflictError();
    if (v.data_date === null) throw new DataError('Add the data date.', '22023', null);
    const rows = live(s, id);
    const missing = rows.filter((a) => a.start_date === null).length;
    if (missing > 0) throw new DataError(`${String(missing)} ${missing === 1 ? 'activity needs' : 'activities need'} a start date.`, '22023', null);
    const cur = currentOf(s, v.project_id);
    if (cur?.data_date && cur.data_date > v.data_date) throw new DataError('The current schedule\'s data date is later.', '22023', null);
    const number = v.number ?? Math.max(0, ...s.versions.filter((x) => x.project_id === v.project_id).map((x) => x.number ?? 0)) + 1;
    out = { number, version: v.version + 1 };
    const now = new Date().toISOString();
    return {
      ...s,
      activities: s.activities.map((a) => (a.version_id === id && a.finish_date === null ? { ...a, finish_date: a.start_date } : a)),
      versions: s.versions.map((x) => {
        if (x.id === cur?.id) return { ...x, status: 'superseded' as const, version: x.version + 1 };
        if (x.id !== id) return x;
        return { ...x, status: 'current' as const, number, published_at: now, published_by: mockUser().id, published_by_name: 'Sol Sample', supersedes_id: cur?.id ?? null, version: out.version };
      }),
    };
  });
  return out;
}

export async function unpublish(id: string): Promise<void> {
  await delay();
  write((s) => {
    need('schedule.manage');
    const v = versionOf(s, id);
    const fresh = v.published_at !== null && Date.now() - Date.parse(v.published_at) < 15 * 60_000;
    if (v.status !== 'current' || v.published_by !== mockUser().id || !fresh) throw new DataError('Too late to undo.', '22023', null);
    return {
      ...s,
      versions: s.versions.map((x) => {
        if (x.id === v.id) return { ...x, status: 'draft' as const, published_at: null, published_by: null, published_by_name: null, supersedes_id: null, version: x.version + 1 };
        if (x.id === v.supersedes_id && x.status === 'superseded') return { ...x, status: 'current' as const, version: x.version + 1 };
        return x;
      }),
    };
  });
}

export async function fileBlob(fileId: string): Promise<{ blob: Blob; filename: string }> {
  await delay();
  const v = read().versions.find((x) => x.file_id === fileId);
  return { blob: new Blob([`Synthetic e2e schedule file ${fileId}\n`], { type: 'application/octet-stream' }), filename: v?.file_name ?? 'Sample schedule' };
}
