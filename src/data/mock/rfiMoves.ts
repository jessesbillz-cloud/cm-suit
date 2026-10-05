// e2e mock of the RFI writes: create (repeat-safe), edit, sign & send, send on, send back, sign & issue (the number
// comes only here), answer, claim impact (permanent, inside the window), GC note, close, void, the job's settings and
// the PDF. Same rules and version checks as the database; every move writes an event.
import { conflictError, DataError } from '../errors';
import type { NewRfiInput, RfiEventKind, RfiFields, RfiRow, RfiSettings, RouteChoice } from '../rfis.types';
import { find, forbidden, has, holds, jobSettings, me, nameOf, read, settingsOut, strip, write } from './rfis';
import type { RfiMockState, StoredRfi, StoredStep } from './rfiSeeds';
import { sheetUrl } from './sheet';
import { delay } from './store';

const DAY = 86_400_000;

function nowIso(): string {
  return new Date().toISOString();
}

function invalid(message: string): DataError {
  return new DataError(message, '22023', null);
}

function fieldsOf(v: RfiFields) {
  const title = v.title.trim();
  const question = v.question.trim();
  if (title === '' || question === '') throw invalid('Add a title and a question.');
  return {
    title, question, photo_ids: v.photoIds, suggestion: v.suggestion.trim(), refs: v.refs.trim(),
    needed_by: v.neededBy, cost_impact: v.costImpact, time_impact: v.timeImpact,
  };
}

interface PutOptions {
  note?: string | null;
  /** Other state to change in the same write (the RFI's route copy, the job's next number). */
  extra?: Partial<RfiMockState>;
  /** The step the event is about (send on: the step that was done). Default: the row's step. */
  step?: number;
}

/** Saves the new row with an event; returns it as the database would. */
function put(next: StoredRfi, kind: RfiEventKind, o: PutOptions = {}): RfiRow {
  write((s) => ({
    ...s,
    ...o.extra,
    rfis: s.rfis.some((x) => x.id === next.id) ? s.rfis.map((x) => (x.id === next.id ? next : x)) : [...s.rfis, next],
    events: [...s.events, { rfi_id: next.id, at: nowIso(), actor: me().id, kind, step: o.step ?? next.step, note: o.note ?? null }],
  }));
  return strip(next);
}

/** The current row at this version, or a conflict. */
function at(id: string, version: number): StoredRfi {
  const r = find(read(), id);
  if (r.version !== version) throw conflictError();
  return r;
}

/** The next holder starts now and has not opened it yet. */
function handOff(r: StoredRfi, patch: Partial<StoredRfi>): StoredRfi {
  return { ...r, ...patch, held_since: nowIso(), held_opened_at: null, version: r.version + 1 };
}

export async function create(v: NewRfiInput): Promise<RfiRow> {
  await delay();
  if (!has('rfi.create_draft')) throw forbidden();
  const s = read();
  const again = s.rfis.find((r) => r.key === v.key);
  if (again) return strip(again);
  const now = nowIso();
  const row: StoredRfi = {
    id: `mock-rfi-${v.projectId}-${String(s.rfis.length + 1)}-${v.key.slice(0, 8)}`, org_id: 'org-sample', project_id: v.projectId,
    number: null, status: 'draft', ...fieldsOf(v), step: 0, due_at: null, held_since: now, held_opened_at: now, sent_at: null,
    issued_at: null, answer: null, answer_file_ids: [], answered_at: null, impact_until: null, impact_claimed_at: null,
    impact_cost: null, impact_time: null, impact_note: null, impact_gc_note: null, closed_at: null, void_note: null,
    pdf_file_id: null, created_by: me().id, created_at: now, version: 1, key: v.key,
  };
  return put(row, 'created');
}

export async function update(id: string, version: number, v: RfiFields): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  if (!holds(read(), r) || !['draft', 'review', 'issue'].includes(r.status)) throw forbidden();
  const next = { ...r, ...fieldsOf(v), version: r.version + 1 };
  const last = [...read().events].reverse().find((e) => e.rfi_id === id);
  // Autosave: one "edited" per sitting, not one per keystroke pause.
  if (last?.kind === 'edited' && last.actor === me().id) {
    write((s) => ({ ...s, rfis: s.rfis.map((x) => (x.id === id ? next : x)) }));
    return strip(next);
  }
  return put(next, 'edited');
}

export async function signSend(id: string, version: number): Promise<RfiRow> {
  await delay(200);
  const r = at(id, version);
  if (r.status !== 'draft' || r.created_by !== me().id) throw forbidden();
  const route = jobSettings(read(), r.project_id).route;
  const next = handOff(r, route.length === 0 ? { status: 'issue', step: 0, sent_at: nowIso() } : { status: 'review', step: 1, sent_at: nowIso() });
  return put(next, 'sent', { extra: { steps: { ...read().steps, [id]: route } } });
}

export async function forward(id: string, version: number, note: string | null): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  if (r.status !== 'review' || !holds(read(), r)) throw forbidden();
  const last = (read().steps[id] ?? []).length;
  const next = handOff(r, r.step < last ? { step: r.step + 1 } : { status: 'issue', step: 0 });
  return put(next, 'forwarded', { note, step: r.step });
}

export async function sendBack(id: string, version: number, note: string): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  if (!['review', 'issue'].includes(r.status) || !holds(read(), r)) throw forbidden();
  if (note.trim() === '') throw invalid('Add a note.');
  return put(handOff(r, { status: 'draft', step: 0 }), 'returned', { note: note.trim() });
}

export async function signIssue(id: string, version: number): Promise<RfiRow> {
  await delay(200);
  const r = at(id, version);
  if (r.status !== 'issue' || !has('rfi.sign_issue')) throw forbidden();
  const s = read();
  const number = s.next[r.project_id] ?? 1;
  const days = jobSettings(s, r.project_id).answer_days;
  const now = Date.now();
  const next = handOff(r, { status: 'open', number, issued_at: nowIso(), due_at: new Date(now + days * DAY).toISOString() });
  return put(next, 'issued', { extra: { next: { ...s.next, [r.project_id]: number + 1 } } });
}

export async function answer(id: string, version: number, text: string, fileIds: string[]): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  if (r.status !== 'open' || !has('rfi.answer')) throw forbidden();
  if (text.trim() === '') throw invalid('Add the answer.');
  const days = jobSettings(read(), r.project_id).impact_days;
  const until = new Date(Date.now() + days * DAY).toISOString();
  return put(handOff(r, { status: 'answered', answer: text.trim(), answer_file_ids: fileIds, answered_at: nowIso(), impact_until: until }), 'answered');
}

export async function claimImpact(id: string, cost: boolean, time: boolean, note: string): Promise<RfiRow> {
  await delay();
  const r = find(read(), id);
  const open = r.impact_until !== null && Date.now() <= Date.parse(r.impact_until);
  if (r.created_by !== me().id || !['answered', 'closed'].includes(r.status) || !open || r.impact_claimed_at !== null) throw forbidden();
  if (!cost && !time) throw invalid('Pick cost, time or both.');
  const next = { ...r, impact_claimed_at: nowIso(), impact_cost: cost, impact_time: time, impact_note: note.trim(), version: r.version + 1 };
  return put(next, 'impact_claimed', { note: note.trim() === '' ? null : note.trim() });
}

export async function gcNote(id: string, note: string): Promise<RfiRow> {
  await delay();
  const r = find(read(), id);
  if (!has('rfi.sign_issue') || r.impact_claimed_at === null) throw forbidden();
  if (note.trim() === '') throw invalid('Add a note.');
  return put({ ...r, impact_gc_note: note.trim(), version: r.version + 1 }, 'impact_note', { note: note.trim() });
}

export async function close(id: string, version: number): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  if (r.status !== 'answered' || (r.created_by !== me().id && !has('rfi.sign_issue'))) throw forbidden();
  return put({ ...r, status: 'closed', closed_at: nowIso(), version: r.version + 1 }, 'closed');
}

export async function voidRfi(id: string, version: number, note: string): Promise<RfiRow> {
  await delay();
  const r = at(id, version);
  const issuer = has('rfi.sign_issue') && r.status !== 'closed' && r.status !== 'void';
  if (!issuer && !(r.created_by === me().id && r.status === 'draft')) throw forbidden();
  if (note.trim() === '') throw invalid('Add a note.');
  return put({ ...r, status: 'void', void_note: note.trim(), version: r.version + 1 }, 'voided', { note: note.trim() });
}

function stepLabel(c: RouteChoice): string {
  if ('role' in c) return c.role.charAt(0).toUpperCase() + c.role.slice(1).replace(/_/g, ' ');
  return nameOf(c.user_id);
}

export async function saveSettings(projectId: string, version: number, answerDays: number, impactDays: number, route: RouteChoice[]): Promise<RfiSettings> {
  await delay();
  if (!has('rfi.sign_issue')) throw forbidden();
  const cur = jobSettings(read(), projectId);
  if (cur.version !== version) throw conflictError();
  if (answerDays < 1 || answerDays > 60 || impactDays < 1 || impactDays > 60) throw invalid('Days are 1 to 60.');
  if (route.length > 10) throw invalid('Up to 10 steps.');
  const steps: StoredStep[] = route.map((c, i) => ({
    position: i + 1, role: 'role' in c ? c.role : null, user_id: 'user_id' in c ? c.user_id : null, label: stepLabel(c),
  }));
  const next = { answer_days: answerDays, impact_days: impactDays, version: version + 1, route: steps };
  write((s) => ({ ...s, settings: { ...s.settings, [projectId]: next } }));
  return settingsOut(next);
}

/** The PDF of the current state (DRAFT before issue), named like the edge function names it. */
export async function pdf(id: string): Promise<{ blob: Blob; filename: string }> {
  await delay(200);
  const r = find(read(), id);
  const safe = r.title.replace(/[^A-Za-z0-9 ._-]+/g, '').trim();
  const filename = r.number === null ? `RFI Draft ${safe}.pdf` : `RFI ${String(r.number).padStart(3, '0')} ${safe}.pdf`;
  return { blob: new Blob([`Synthetic e2e RFI PDF: ${r.title}\n`], { type: 'application/pdf' }), filename };
}

/** The RFI's PDF to look at: the synthetic plan set stands in for it (real pages for the viewer to draw). */
export async function viewUrl(id: string): Promise<string> {
  await pdf(id);
  return sheetUrl();
}
