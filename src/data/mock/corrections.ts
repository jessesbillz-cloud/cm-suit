// e2e mock of the corrections log. Follows the database's rules (numbers per job, repeat-safe create, only
// corrections.close decides, undo of your own latest step) so the e2e exercises the same flow. The mock user decides
// the capabilities: 'inspector' opens and decides; 'sub' and 'foreman' mark ready; 'bidder' sees nothing; everyone
// else (the default 'pm') opens and marks ready. State lives in sessionStorage, never module state.
import { conflictError, DataError } from '../errors';
import {
  STEP_CAPABILITY,
  STEP_FROM,
  STEP_PHOTO_LIMIT,
  correctionSchema,
  type CorrectionFields,
  type CorrectionHistoryRow,
  type CorrectionRow,
  type NewCorrectionInput,
  type PhotoFile,
  type StepInput,
  type UndoResult,
} from '../corrections.types';
import * as api from './api';
import { SEED_CORRECTION } from './boardSeeds';
import { mockUser } from './index';
import { delay } from './store';

const KEY = 'e2e-mock-corrections';

interface StoredRow extends CorrectionRow {
  request_key: string;
  deleted: boolean;
}

interface State {
  rows: StoredRow[];
  history: CorrectionHistoryRow[];
}

function read(): State {
  const raw = window.sessionStorage.getItem(KEY);
  // Sample Job B starts with CN-004 (a board line points at it).
  return raw === null ? { rows: [SEED_CORRECTION], history: [] } : (JSON.parse(raw) as State);
}

function write(update: (s: State) => State): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

const CAPS: Record<string, readonly string[]> = {
  inspector: ['corrections.view', 'corrections.create', 'corrections.close'],
  sub: ['corrections.view', 'corrections.mark_ready'],
  foreman: ['corrections.view', 'corrections.mark_ready'],
  bidder: [],
};
const DEFAULT_CAPS = ['corrections.view', 'corrections.create', 'corrections.mark_ready'];

function holds(cap: string): boolean {
  const who = mockUser().id.replace(/^mock-user-/, '');
  return (CAPS[who] ?? DEFAULT_CAPS).includes(cap);
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return holds(cap);
}

function forbidden(): DataError {
  return new DataError("You don't have access to that.", '42501', 'forbidden');
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The row as the database returns it (zod drops the mock-only fields). */
function strip(row: StoredRow): CorrectionRow {
  return correctionSchema.parse(row);
}

function addHistory(s: State, entry: Omit<CorrectionHistoryRow, 'id' | 'seq' | 'created_at' | 'actor_user_id'>): State {
  const seq = s.history.length + 1;
  const row: CorrectionHistoryRow = { ...entry, id: `cnh-${String(seq)}`, seq, created_at: nowIso(), actor_user_id: mockUser().id };
  return { ...s, history: [...s.history, row] };
}

export async function list(projectId: string): Promise<CorrectionRow[]> {
  await delay();
  if (!holds('corrections.view')) return [];
  return read()
    .rows.filter((r) => r.project_id === projectId && !r.deleted)
    .sort((a, b) => b.number - a.number)
    .map(strip);
}

export async function history(correctionId: string): Promise<CorrectionHistoryRow[]> {
  await delay();
  if (!holds('corrections.view')) return [];
  return read().history.filter((h) => h.correction_id === correctionId);
}

export async function create(input: NewCorrectionInput): Promise<CorrectionRow> {
  await delay();
  if (!holds('corrections.create')) throw forbidden();
  const s = read();
  const again = s.rows.find((r) => r.project_id === input.projectId && r.request_key === input.requestKey);
  if (again) return strip(again);
  const number = Math.max(0, ...s.rows.filter((r) => r.project_id === input.projectId).map((r) => r.number)) + 1;
  const row: StoredRow = {
    id: `cn-${input.projectId}-${String(number)}`,
    project_id: input.projectId,
    number,
    title: input.title.trim(),
    description: input.description,
    photo_ids: input.photoIds,
    status: 'open',
    trade: input.trade.trim(),
    location: input.location.trim(),
    spec_tags: [],
    notice_file_id: input.noticeFileId,
    notice_ref: '',
    created_by: mockUser().id,
    created_at: nowIso(),
    closed_at: null,
    version: 1,
    request_key: input.requestKey,
    deleted: false,
  };
  write((st) => addHistory({ ...st, rows: [...st.rows, row] }, { correction_id: row.id, action: 'created', from_status: null, to_status: 'open', note: '', photo_ids: [], undoes: null }));
  return strip(row);
}

function current(id: string, version: number): StoredRow {
  const row = read().rows.find((r) => r.id === id && !r.deleted);
  if (!row) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
  if (row.version !== version) throw conflictError();
  return row;
}

function replaceRow(s: State, row: StoredRow): State {
  return { ...s, rows: s.rows.map((r) => (r.id === row.id ? row : r)) };
}

export async function save(row: CorrectionRow, patch: CorrectionFields & { notice_file_id: string | null; photo_ids: string[] }): Promise<CorrectionRow> {
  await delay();
  const was = current(row.id, row.version);
  if (!((was.created_by === mockUser().id && holds('corrections.create')) || holds('corrections.close'))) throw conflictError();
  const next: StoredRow = { ...was, ...patch, version: was.version + 1 };
  write((s) => addHistory(replaceRow(s, next), { correction_id: row.id, action: 'edited', from_status: next.status, to_status: next.status, note: '', photo_ids: [], undoes: null }));
  return strip(next);
}

export async function step(input: StepInput): Promise<CorrectionRow> {
  await delay();
  if (!holds(STEP_CAPABILITY[input.status])) throw forbidden();
  const was = current(input.row.id, input.row.version);
  if (!STEP_FROM[input.status].includes(was.status)) throw new DataError('That step does not apply now. Reload to see the latest.', '22023', null);
  if (input.photoIds.length > STEP_PHOTO_LIMIT) throw new DataError('Up to 6 photos.', '22023', null);
  const closing = input.status === 'corrected' || input.status === 'signed_off';
  const next: StoredRow = { ...was, status: input.status, closed_at: closing ? (was.closed_at ?? nowIso()) : null, version: was.version + 1 };
  write((s) => addHistory(replaceRow(s, next), { correction_id: was.id, action: input.status, from_status: was.status, to_status: input.status, note: input.note.trim(), photo_ids: input.photoIds, undoes: null }));
  return strip(next);
}

export async function undo(row: CorrectionRow): Promise<UndoResult> {
  await delay();
  const was = current(row.id, row.version);
  const s = read();
  const last = s.history.filter((h) => h.correction_id === row.id).sort((a, b) => b.seq - a.seq)[0];
  if (!last || last.actor_user_id !== mockUser().id || last.action === 'edited' || last.action === 'undone') {
    throw new DataError('Nothing to undo.', '22023', null);
  }
  const status = last.action === 'created' ? was.status : correctionSchema.shape.status.parse(last.from_status);
  const closed = status === 'corrected' || status === 'signed_off';
  const next: StoredRow = { ...was, status, closed_at: closed ? (was.closed_at ?? nowIso()) : null, deleted: last.action === 'created', version: was.version + 1 };
  write((st) => addHistory(replaceRow(st, next), { correction_id: row.id, action: 'undone', from_status: last.to_status, to_status: next.deleted ? null : status, note: '', photo_ids: [], undoes: last.id }));
  return { row: strip(next), removed: next.deleted };
}

/** correction_step_note: my own latest status step, still undoable, with no note yet. */
export async function stepNote(correctionId: string, note: string): Promise<CorrectionHistoryRow> {
  await delay();
  const text = note.trim();
  if (text === '') throw new DataError('Add a note.', '22023', null);
  const s = read();
  const last = s.history.filter((h) => h.correction_id === correctionId).sort((a, b) => b.seq - a.seq)[0];
  const steps: readonly string[] = ['ready', 'corrected', 'signed_off', 'reopened'];
  if (!last || last.actor_user_id !== mockUser().id || !steps.includes(last.action) || last.note !== '' || Date.parse(last.created_at) < Date.now() - 15 * 60_000) {
    throw new DataError('Too late to add a note.', '22023', null);
  }
  const next = { ...last, note: text };
  write((st) => ({ ...st, history: st.history.map((h) => (h.id === last.id ? next : h)) }));
  return next;
}

export async function photoFolder(projectId: string): Promise<string> {
  await delay();
  if (!holds('corrections.create') && !holds('corrections.mark_ready') && !holds('corrections.close')) throw forbidden();
  return `${projectId}-corrections`;
}

export async function noticeFolder(projectId: string): Promise<string> {
  await delay();
  if (!holds('corrections.create') && !holds('corrections.close')) throw forbidden();
  return `${projectId}-corrections-notices`;
}

export async function photoFiles(ids: readonly string[]): Promise<PhotoFile[]> {
  const rows = await Promise.all(ids.map((id) => api.file(id)));
  return rows.flatMap((f) => (f ? [{ id: f.id, original_name: f.original_name, mime: f.mime, size: f.size, created_at: f.created_at }] : []));
}
