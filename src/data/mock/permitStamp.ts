// e2e mock of the official's stamp (0053, permit-stamp) with the database's rules: the official stamps (in review or
// backcheck: issue; issued and building: a revision), one PDF at a time; the copies are synthetic files waiting in the
// job's hidden "Stamping" folder until the set is recorded, then move to "Approved plans / <number>"; the earlier set is
// superseded into its "Superseded" folder; the same set again returns the first answer. Seeded: 24-0001 with two sets
// (the first superseded) and 25-0102 with one (mock/permitJobs has their files). State lives in sessionStorage.
import { buildFilename } from '../../lib/buildFilename';
import { todayInZone } from '../../lib/dates';
import { conflictError } from '../errors';
import type { PermitRef } from '../permits.types';
import type { ApprovedSet, PermitApproved, RecordResult, StampMode, StampSource, StampedFile } from '../permitStamp.types';
import type { FileRow, FolderRow } from '../types';
import * as api from './api';
import { mockUser } from './index';
import { permitJobZone } from './permitJobs';
import { yearOn, type StoredPermit } from './permitSeeds';
import { fail, has, mustHave, nameOf, read, stored, write } from './permitStore';
import { delay, readMock, writeMock } from './store';

const KEY = 'e2e-mock-permit-stamp';
const DAY = 86_400_000;

interface Row {
  permit_id: string;
  set_no: number;
  position: number;
  source_file_id: string;
  file_id: string;
  stamped_by: string;
  stamped_at: string;
  superseded_at: string | null;
  note: string | null;
}

type RowSeed = [permit: string, set: number, file: string, source: string, daysAgo: number, supersededDaysAgo: number | null];

const SEEDS: RowSeed[] = [
  ['mock-permit-s1', 1, 'mock-stamped-s1-1a', 'job-s-plan-a101', 150, 40],
  ['mock-permit-s1', 2, 'mock-stamped-s1-2a', 'job-s-plan-a101', 40, null],
  ['mock-permit-s1', 2, 'mock-stamped-s1-2b', 'job-s-plan-a201', 40, null],
  ['mock-permit-t1', 1, 'mock-stamped-t1-1a', 'job-t-plan-a101', 10, null],
];

function seed(now: number): Row[] {
  return SEEDS.map(([permit, set, file, source, ago, gone], i) => ({
    permit_id: permit, set_no: set, position: i + 1, source_file_id: source, file_id: file, stamped_by: 'mock-user-ahj',
    stamped_at: new Date(now - ago * DAY).toISOString(), superseded_at: gone === null ? null : new Date(now - gone * DAY).toISOString(),
    note: null,
  }));
}

function rows(): Row[] {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seed(Date.now()) : (JSON.parse(raw) as Row[]);
}

function saveRows(next: Row[]): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

/** permit_stamp_mode: issue where the permit may be issued next, a revision once issued and building. */
const MODE: Readonly<Record<string, StampMode>> = { in_review: 'issue', backcheck: 'issue', issued: 'revise', inspections: 'revise', approved: 'revise' };

function permitOf(id: string): StoredPermit {
  return stored(read(), id);
}

async function fileOf(id: string): Promise<FileRow> {
  const f = await api.file(id);
  if (!f) throw fail('That item no longer exists.', 'P0002');
  return f;
}

/** A system folder of the permit's tree, made once (a seeded one is already there). */
async function ensureFolder(f: FolderRow): Promise<string> {
  if (!(await api.folders(f.project_id)).some((x) => x.id === f.id)) writeMock((m) => ({ ...m, folders: [...m.folders, f] }));
  return f.id;
}

function treeFolder(id: string, projectId: string, parentId: string, name: string, kind: string, sort: number): FolderRow {
  return { id, project_id: projectId, parent_id: parentId, name, kind, view_only: false, proprietary: false, sort, ai_reads: false, version: 1, file_count: null };
}

function moveFiles(ids: readonly string[], folderId: string, all: readonly FileRow[]): void {
  const moved = all.filter((f) => ids.includes(f.id)).map((f) => ({ ...f, folder_id: folderId }));
  writeMock((m) => ({ ...m, files: [...m.files.filter((f) => !ids.includes(f.id)), ...moved] }));
}

export async function approved(permitId: string): Promise<PermitApproved> {
  await delay();
  const p = permitOf(permitId);
  const mine = rows().filter((r) => r.permit_id === p.id);
  const sets: ApprovedSet[] = [];
  for (const no of [...new Set(mine.map((r) => r.set_no))].sort((a, b) => b - a)) {
    const of = mine.filter((r) => r.set_no === no).sort((a, b) => a.position - b.position);
    const first = of[0];
    if (!first) continue;
    const files = await Promise.all(of.map(async (r) => {
      const f = await fileOf(r.file_id);
      const src = await api.file(r.source_file_id);
      return { file_id: f.id, name: f.original_name, size: f.size, source_name: src?.original_name ?? null, content_hash: 'ab12'.repeat(16) };
    }));
    sets.push({ set_no: no, stamped_at: first.stamped_at, stamped_by_name: nameOf(first.stamped_by) ?? 'Someone', note: first.note, superseded_at: first.superseded_at, files });
  }
  return { stamp: has('permits.manage') ? (MODE[p.stage] ?? null) : null, sets };
}

const SOURCE_ORDER: Readonly<Record<string, number>> = { plans: 0, permit_uploads: 1 };

export async function sources(permitId: string): Promise<StampSource[]> {
  await delay();
  mustHave('permits.manage');
  const p = permitOf(permitId);
  const folders = (await api.folders(p.project_id)).filter((f) => f.kind !== 'approved_plans' && f.kind !== 'stamping');
  const out: StampSource[] = [];
  for (const fo of folders) {
    for (const f of await api.files(fo.id)) {
      if (!/\.pdf$/i.test(f.original_name) || !f.upload_complete) continue;
      out.push({ id: f.id, name: f.original_name, size: f.size, folder_id: fo.id, folder_name: fo.name, folder_kind: fo.kind, created_at: f.created_at });
    }
  }
  const order = (s: StampSource) => SOURCE_ORDER[s.folder_kind] ?? 2;
  return out.sort((a, b) => order(a) - order(b) || a.folder_name.localeCompare(b.folder_name) || a.name.localeCompare(b.name));
}

/** The job's "To stamp" folder (permit_stamp_folders' uploads). */
export async function uploadsFolder(permitId: string): Promise<string> {
  await delay();
  mustHave('permits.manage');
  const p = permitOf(permitId);
  return await ensureFolder(treeFolder(`${p.project_id}-to-stamp`, p.project_id, `${p.project_id}-approved`, 'To stamp', 'permit_uploads', 10));
}

export async function stamp(ref: PermitRef, fileId: string): Promise<StampedFile> {
  await delay(250);
  mustHave('permits.manage');
  const p = permitOf(ref.id);
  if (p.version !== ref.version) throw conflictError();
  if (!MODE[p.stage]) throw fail("This permit can't be stamped now.");
  const src = await fileOf(fileId);
  if (!/\.pdf$/i.test(src.original_name)) throw fail('Only PDFs can be stamped.');
  const name = buildFilename('{Name} - Approved {Permit}.pdf', { fields: { Name: src.original_name.replace(/\.pdf$/i, ''), Permit: p.primary_number } });
  const at = new Date().toISOString();
  const copy: FileRow = {
    id: `mock-stamped-${String(readMock().files.length + 1)}-${String(Date.now())}`, project_id: p.project_id,
    folder_id: `${p.project_id}-stamping`, original_name: name, mime: 'application/pdf', size: src.size + 4096,
    scan_status: 'clean', upload_complete: true, created_at: at, created_by: mockUser().id,
  };
  writeMock((m) => ({ ...m, files: [...m.files, copy] }));
  return { source_file_id: src.id, stamped_file_id: copy.id, stamped_at: at, name, pages: 1 };
}

type Item = Pick<StampedFile, 'source_file_id' | 'stamped_file_id' | 'stamped_at'>;

function issue(p: StoredPermit, setNo: number, count: number): void {
  const now = new Date().toISOString();
  const issued = p.issued_on ?? todayInZone(permitJobZone(p.project_id));
  write((x) => ({
    ...x,
    permits: x.permits.map((q) => (q.id === p.id
      ? { ...q, stage: 'issued', stage_since: now, issued_on: issued, expires_on: q.expires_on ?? yearOn(issued), version: q.version + 1 }
      : q)),
    events: [...x.events, {
      id: x.events.length + 1, permit_id: p.id, stage: 'issued', at: now, actor: mockUser().id,
      note: `Approved set ${String(setNo)}: ${String(count)} ${count === 1 ? 'file' : 'files'}`,
      prior: { issued_on: p.issued_on, expires_on: p.expires_on }, undone: false,
    }],
  }));
}

export async function record(ref: PermitRef, items: readonly Item[]): Promise<RecordResult> {
  await delay(200);
  mustHave('permits.manage');
  const p = permitOf(ref.id);
  const all = rows();
  const known = all.filter((r) => items.some((i) => i.stamped_file_id === r.file_id));
  const knownSet = known[0]?.set_no;
  if (known.length > 0) {
    if (known.length === items.length && known.every((r) => r.permit_id === p.id && r.set_no === knownSet) && knownSet !== undefined) {
      return { set_no: knownSet, files: items.length, issued: false };
    }
    throw fail('Some of these files are already recorded.');
  }
  if (p.version !== ref.version) throw conflictError();
  const mode = MODE[p.stage];
  if (!mode) throw fail("This permit can't be stamped now.");
  const files = [...readMock().files];
  for (const i of items) {
    const f = files.find((x) => x.id === i.stamped_file_id);
    if (!f || f.folder_id !== `${p.project_id}-stamping` || f.created_by !== mockUser().id) throw fail('A stamped file is missing. Stamp it again.');
  }
  const setNo = Math.max(0, ...all.filter((r) => r.permit_id === p.id).map((r) => r.set_no)) + 1;
  const folderId = await ensureFolder(treeFolder(`${p.id}-folder`, p.project_id, `${p.project_id}-approved`, p.primary_number, 'approved_plans', 100));
  const current = all.filter((r) => r.permit_id === p.id && r.superseded_at === null);
  const now = new Date().toISOString();
  if (current.length > 0) {
    const old = await ensureFolder(treeFolder(`${p.id}-superseded`, p.project_id, folderId, 'Superseded', 'approved_plans', 900));
    moveFiles(current.map((r) => r.file_id), old, await Promise.all(current.map((r) => fileOf(r.file_id))));
  }
  saveRows([
    ...all.map((r) => (r.permit_id === p.id && r.superseded_at === null ? { ...r, superseded_at: now } : r)),
    ...items.map((i, k): Row => ({
      permit_id: p.id, set_no: setNo, position: k + 1, source_file_id: i.source_file_id, file_id: i.stamped_file_id,
      stamped_by: mockUser().id, stamped_at: i.stamped_at, superseded_at: null, note: null,
    })),
  ]);
  moveFiles(items.map((i) => i.stamped_file_id), folderId, readMock().files);
  if (mode === 'issue') issue(p, setNo, items.length);
  return { set_no: setNo, files: items.length, issued: mode === 'issue' };
}

/** A stamped sheet for the browser's viewer (synthetic text, never a real file). */
export async function viewBlob(fileId: string): Promise<Blob> {
  const f = await fileOf(fileId);
  return new Blob([`Synthetic stamped sheet: ${f.original_name}\n`], { type: 'text/plain' });
}
