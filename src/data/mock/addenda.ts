// Addenda in the e2e mock, like the database (0011, 0076): Sample Job A's addendum 1 is issued with one sketch in the
// job's Addenda folder; a manager adds drafts (numbered at once), edits them with a version check, attaches files,
// discards a draft and brings it back. An issued addendum never changes. Lives in sessionStorage, never module state.
import type { AddendumRow } from '../bids.types';
import { conflictError, DataError } from '../errors';
import type { FileRow } from '../types';
import { delay } from './store';

const KEY = 'e2e-mock-addenda';

/** The issued addendum's sketch: in the job's Addenda folder, which only bids managers browse. */
export const ADDENDUM_FILES: FileRow[] = [
  {
    id: 'job-a-addendum-file-1',
    project_id: 'job-a',
    folder_id: 'job-a-addenda',
    original_name: 'Sample SK-1 revised schedule.pdf',
    mime: 'application/pdf',
    size: 24_576,
    scan_status: 'clean',
    upload_complete: true,
    created_at: '2026-09-23T16:00:00Z',
    created_by: 'mock-user-pm',
  },
];

const FIXTURES: AddendumRow[] = [
  {
    id: 'add-1',
    project_id: 'job-a',
    number: 1,
    title: 'Sample schedule change',
    body: 'Bid date moves one week.',
    file_ids: ['job-a-addendum-file-1'],
    issued_at: '2026-09-23T17:00:00Z',
    version: 2,
  },
];

interface Stored {
  /** Rows made or changed in this test, by id (a changed fixture too). */
  rows: AddendumRow[];
  discarded: string[];
}

function read(): Stored {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { rows: [], discarded: [] } : (JSON.parse(raw) as Stored);
}

function write(update: (s: Stored) => Stored): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

function all(): AddendumRow[] {
  const s = read();
  const base = FIXTURES.map((f) => s.rows.find((r) => r.id === f.id) ?? f);
  return [...base, ...s.rows.filter((r) => !base.some((b) => b.id === r.id))];
}

/** A job's live addenda, newest first (the query's order). */
export function list(projectId: string): AddendumRow[] {
  const gone = read().discarded;
  return all()
    .filter((a) => a.project_id === projectId && !gone.includes(a.id))
    .sort((a, b) => b.number - a.number);
}

/** The files an issued addendum carries: what a bidder may open from the Addenda folder. */
export function issuedFileIds(): string[] {
  const gone = read().discarded;
  return all().flatMap((a) => (a.issued_at !== null && !gone.includes(a.id) ? a.file_ids : []));
}

function put(row: AddendumRow): AddendumRow {
  write((s) => ({ ...s, rows: [...s.rows.filter((r) => r.id !== row.id), row] }));
  return row;
}

function draftOrThrow(id: string): AddendumRow {
  const row = all().find((a) => a.id === id);
  if (!row) throw new DataError('That item no longer exists.', 'P0002', 'mock: addendum not found');
  if (row.issued_at !== null) throw new DataError('An issued addendum stays.', '42501', 'mock: addendum issued');
  return row;
}

/** create_addendum: numbered by the "database" (the job's next number; a discarded draft keeps its number). */
export async function create(projectId: string, title: string, body: string): Promise<AddendumRow> {
  await delay();
  const mine = all().filter((a) => a.project_id === projectId);
  const number = Math.max(0, ...mine.map((a) => a.number)) + 1;
  return put({ id: `mock-addendum-${projectId}-${String(number)}`, project_id: projectId, number, title, body, file_ids: [], issued_at: null, version: 1 });
}

export async function save(row: AddendumRow, patch: Partial<Pick<AddendumRow, 'title' | 'body' | 'file_ids'>>): Promise<AddendumRow> {
  await delay();
  const current = draftOrThrow(row.id);
  if (current.version !== row.version) throw conflictError();
  return put({ ...current, ...patch, version: current.version + 1 });
}

/** add_addendum_file: whatever the draft's version; the same file twice changes nothing. */
export async function addFile(addendumId: string, fileId: string): Promise<AddendumRow> {
  await delay();
  const current = draftOrThrow(addendumId);
  if (current.file_ids.includes(fileId)) return current;
  return put({ ...current, file_ids: [...current.file_ids, fileId], version: current.version + 1 });
}

/** set_addendum_discarded: drafts only, with a version check; returns the new version. */
export async function setDiscarded(id: string, version: number, discarded: boolean): Promise<number> {
  await delay();
  const current = draftOrThrow(id);
  if (current.version !== version) throw conflictError();
  const next = put({ ...current, version: current.version + 1 });
  write((s) => ({ ...s, discarded: discarded ? [...s.discarded, id] : s.discarded.filter((x) => x !== id) }));
  return next.version;
}
