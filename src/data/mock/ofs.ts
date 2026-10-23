// e2e mock of the fire marshal's review (0106), with the database's rules for files: a submittal (the Submittals section)
// or an RFI document (RFIs' Uploaded folder) is marked by anyone who adds files there (every persona but the fire
// marshal, the sub, the foreman and the bidder), on a job that takes OFS requests; once marked it reaches the fire marshal
// ('ahj', ofs.review), who decides Approved or Not approved with the item's version check and his key. A later decision
// supersedes the earlier one; a decided mark stays. The designated person (ir.decide, or the OFS duty holder) gets the
// start page. The mock marks no RFI of the RFI tool and has no fire list (ofs_suggest marks nothing). Synthetic state in
// sessionStorage, never module state.
import { conflictError } from '../errors';
import type { DecideInput, MarkInput } from '../ofs';
import type { DeskData, DeskRow, OfsItem, OfsKind, OfsReviewRow, OfsTarget } from '../ofs.types';
import type { FolderRow } from '../types';
import * as api from './api';
import { holder } from './duties';
import { mockUser } from './index';
import * as mockIr from './inspections';
import { forbidden, holds, notFound, refuse } from './irRules';
import { projectSettings } from './jobs';
import { failedRows } from './ofsFailed';
import { read as readRevs } from './revs';
import { delay } from './store';

const KEY = 'e2e-mock-ofs';
/** Personas that add no files to Submittals or RFIs (role_permissions has no files writing row for them). */
const NO_MARK: readonly string[] = ['ahj', 'sub', 'foreman', 'bidder', 'requester', 'visitor', 'anon', 'special_inspector'];

interface StoredDecision {
  id: string;
  item_id: string;
  decision: 'approved' | 'not_approved';
  comment: string | null;
  at: string;
  by: string;
  key: string;
}

interface StoredItem {
  id: string;
  project_id: string;
  kind: OfsKind;
  file_id: string;
  marked: boolean;
  marked_by: string;
  marked_at: string;
  version: number;
  decision_id: string | null;
}

interface State {
  items: StoredItem[];
  decisions: StoredDecision[];
}

function read(): State {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { items: [], decisions: [] } : (JSON.parse(raw) as State);
}

function write(s: State): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(s));
}

const persona = () => mockUser().id.replace(/^mock-user-/, '');
const reviewer = () => persona() === 'ahj';

function ofsOn(projectId: string): boolean {
  const s = projectSettings(projectId);
  return typeof s === 'object' && s !== null && (s as Record<string, unknown>)['ir_ofs_allowed'] === true;
}

/** ofs_file_kind: a submittal, an RFI document, or neither. */
function kindIn(folderId: string, all: readonly FolderRow[]): OfsKind | null {
  let at = all.find((f) => f.id === folderId);
  for (let depth = 0; at !== undefined && depth < 32; depth += 1) {
    const here: FolderRow = at;
    if (here.kind === 'submittals') return 'submittal';
    const parent = all.find((f) => f.id === here.parent_id);
    if (here.kind === 'general' && here.name === 'Uploaded' && parent?.kind === 'rfis' && parent.parent_id === null) return 'rfi_document';
    if (here.kind !== 'general') return null;
    at = parent;
  }
  return null;
}

function decisionRow(d: StoredDecision) {
  return { decision: d.decision, comment: d.comment, at: d.at, name: d.by === 'mock-user-ahj' ? 'Sample Fire Marshal' : 'Sample Member' };
}

async function itemJson(s: State, i: StoredItem): Promise<OfsItem> {
  const f = await api.file(i.file_id);
  const current = s.decisions.find((d) => d.id === i.decision_id) ?? null;
  const sent = i.marked && f !== null;
  return {
    id: i.id,
    project_id: i.project_id,
    kind: i.kind,
    rfi_id: null,
    file_id: i.file_id,
    marked: i.marked,
    version: i.version,
    may_mark: !NO_MARK.includes(persona()) && (i.decision_id === null || !i.marked),
    sent,
    may_decide: sent && reviewer(),
    number: null,
    title: f?.original_name ?? null,
    file_name: f?.original_name ?? null,
    mime: f?.mime ?? null,
    size: f?.size ?? null,
    section: f?.spec_section ?? null,
    sent_at: i.marked_at,
    decision: current ? decisionRow(current) : null,
    history: s.decisions
      .filter((d) => d.item_id === i.id && d.id !== i.decision_id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(decisionRow),
  };
}

/** ofs_item_state */
export async function itemState(t: OfsTarget): Promise<OfsItem | null> {
  await delay();
  const s = read();
  if ('rfiId' in t) return null;
  const i = 'itemId' in t ? s.items.find((x) => x.id === t.itemId) : s.items.find((x) => x.file_id === t.fileId);
  if (i) {
    if (reviewer() && !i.marked) throw notFound();
    return itemJson(s, i);
  }
  if ('itemId' in t) throw notFound();
  const f = await api.file(t.fileId);
  if (!f) throw notFound();
  const kind = kindIn(f.folder_id, await api.folders(f.project_id));
  if (kind === null || !ofsOn(f.project_id) || NO_MARK.includes(persona())) return null;
  return { id: null, marked: false, version: 0, may_mark: true, sent: false, may_decide: false, decision: null, history: [] };
}

/** ofs_mark (files only in the mock) */
export async function mark(v: MarkInput): Promise<OfsItem> {
  await delay();
  if (!('fileId' in v.target)) throw refuse('The mock marks files only.');
  const fileId = v.target.fileId;
  const f = await api.file(fileId);
  if (!f) throw notFound();
  if (NO_MARK.includes(persona())) throw forbidden();
  const kind = kindIn(f.folder_id, await api.folders(f.project_id));
  if (kind === null) throw refuse('Only RFIs and submittals go to OFS.');
  if (!ofsOn(f.project_id)) throw refuse('OFS is off for this job.');
  const s = read();
  const now = new Date().toISOString();
  const was = s.items.find((x) => x.file_id === fileId);
  if (!was) {
    if (!v.on) throw refuse('It is not marked.');
    if (v.version !== 0) throw conflictError();
    const made: StoredItem = {
      id: `mock-ofs-${String(s.items.length + 1)}`, project_id: f.project_id, kind, file_id: fileId, marked: true,
      marked_by: mockUser().id, marked_at: now, version: 1, decision_id: null,
    };
    write({ ...s, items: [...s.items, made] });
    return itemJson(read(), made);
  }
  if (was.marked === v.on) return itemJson(s, was);
  if (was.version !== v.version) throw conflictError();
  if (!v.on && was.decision_id !== null) throw refuse('OFS has decided on it. It stays fire / life safety.');
  const next = { ...was, marked: v.on, marked_by: mockUser().id, marked_at: now, version: was.version + 1 };
  write({ ...s, items: s.items.map((x) => (x.id === was.id ? next : x)) });
  return itemJson(read(), next);
}

/** ofs_suggest: the mock has no fire list. */
export async function suggest(): Promise<number> {
  await delay();
  return 0;
}

/** ofs_decide */
export async function decide(v: DecideInput): Promise<OfsItem> {
  await delay();
  const s = read();
  const i = s.items.find((x) => x.id === v.itemId);
  if (!i || (reviewer() && !i.marked)) throw notFound();
  if (!reviewer()) throw forbidden();
  if (s.decisions.some((d) => d.key === v.key && d.by === mockUser().id)) return itemJson(s, i);
  if (!i.marked) throw refuse('This is not with OFS.');
  if (i.version !== v.version) throw conflictError();
  const comment = v.comment.trim();
  const d: StoredDecision = {
    id: `mock-ofs-decision-${String(s.decisions.length + 1)}`, item_id: i.id, decision: v.decision,
    comment: comment === '' ? null : comment, at: new Date().toISOString(), by: mockUser().id, key: v.key,
  };
  const next = { ...i, decision_id: d.id, version: i.version + 1 };
  write({ items: s.items.map((x) => (x.id === i.id ? next : x)), decisions: [...s.decisions, d] });
  return itemJson(read(), next);
}

/** Every marked item of the job (null: all), as the database's own function reads them. */
async function rowsOf(s: State, projectId: string | null): Promise<OfsReviewRow[]> {
  const rows = await Promise.all(
    s.items
      .filter((i) => i.marked && (projectId === null || i.project_id === projectId))
      .map(async (i): Promise<OfsReviewRow | null> => {
        const f = await api.file(i.file_id);
        if (!f) return null;
        const d = s.decisions.find((x) => x.id === i.decision_id) ?? null;
        return {
          id: i.id, project_id: i.project_id, kind: i.kind, rfi_id: null, file_id: i.file_id, number: null, title: f.original_name,
          section: f.spec_section ?? null, sent_at: i.marked_at, decision: d?.decision ?? null, decided_at: d?.at ?? null, version: i.version,
        };
      }),
  );
  return rows.filter((r): r is OfsReviewRow => r !== null).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

/** ofs_review_list */
export async function reviewList(projectId: string | null): Promise<OfsReviewRow[]> {
  await delay();
  return reviewer() ? rowsOf(read(), projectId) : [];
}

/** ofs_desk: the designated person's, or the requester's (own OFS requests sent to OFS); a request that failed walls
 *  shows as its failed items (mock/ofsFailed). */
export async function desk(projectId: string): Promise<DeskData | null> {
  await delay();
  const me = mockUser().id;
  if (!ofsOn(projectId)) return null;
  const designated = holds(me, 'ir.decide') || holder(projectId) === me;
  const sent = (await mockIr.list(projectId, (r) => r.kind === 'ofs' && r.ofs_sent_at !== null && r.status !== 'withdrawn'))
    .filter((r) => designated || r.requested_by === me);
  if (!designated && !(holds(me, 'ir.request') && sent.length > 0)) return null;
  const items = designated
    ? (await rowsOf(read(), projectId)).map(
        (r): DeskRow => ({
          id: r.id, kind: r.kind, target_type: 'file', target_id: r.file_id ?? '', number: null, title: r.title,
          state: r.decision ?? 'waiting', at: r.decided_at ?? r.sent_at,
        }),
      )
    : [];
  const walls = new Set(readRevs().cells.map((c) => c.request_id));
  const requests = sent
    .filter((r) => !(r.result === 'not_approved' && walls.has(r.id)))
    .map(
      (r): DeskRow => ({
        id: r.id, kind: 'inspection', target_type: 'inspection_request', target_id: r.id, number: r.ofs_number ?? null,
        title: r.items.trim().slice(0, 200), state: r.result === 'approved' ? 'passed' : r.result === 'not_approved' ? 'failed' : 'waiting',
        at: r.result_at ?? r.ofs_sent_at ?? r.created_at,
      }),
    );
  const failed = await failedRows(projectId, sent);
  return { designated, rows: [...items, ...requests, ...failed].sort((a, b) => b.at.localeCompare(a.at)) };
}

/** has_capability for ofs.* */
export async function capability(cap: string): Promise<boolean> {
  await delay();
  return cap === 'ofs.review' && reviewer();
}

/** ofs_fire_standard: the mock's copy of the standard list. */
export async function standard(): Promise<string[]> {
  await delay();
  return ['21', '28', '078100', '078123', '078400', '078413', '078443'];
}

/** What waits on the fire marshal, for the rail's count. */
export async function waitingIds(projectId: string | null): Promise<string[]> {
  return (await reviewList(projectId)).filter((r) => r.decision === null).map((r) => r.id);
}
