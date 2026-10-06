// Mock inspections for e2e: synthetic requests kept in sessionStorage (its own key), read and changed by the database's
// rules (mock/irRules: who holds which right, who reads a request, who decides it now, the route of an OFS request,
// each step's refusals). Generate IR is mocked as the database records it (complete, the IR on file); the PDF's bytes
// and email are server-only and are not mocked. `list`, `request`, `events` and `calendar`
// answer as the signed-in mock user reads them; the `server*` reads are what the database's own functions see (the
// link's receipts and day, the revs status).
import { todayInZone } from '../../lib/dates';
import { parseProjectSettings } from '../../lib/settings';
import { conflictError } from '../errors';
import type { CalendarRow, FormContext, IrEvent, IrRecipient, IrRequest, IrRowRaw, NewBlock } from '../inspections.types';
import { SEED_IR } from './boardSeeds';
import { MOCK_PEOPLE } from './fixtures';
import { calendarRows, type MockBlock } from './irCalendar';
import { permitJobRequests, seedBlocks, seedRequests } from './irSeeds';
import { mockUser } from './index';
import { STEPS, actionOf, firstStatus, forbidden, holds, maySee, mustDecide, notFound, opt, ownerOk, refuse, type Args } from './irRules';
import { projectSettings } from './jobs';
import { has as hasPermitRight } from './permitStore';
import { revsJobRequests } from './revSeeds';
import { read as readRevs } from './revs';
import { delay, readMock } from './store';

const KEY = 'e2e-mock-ir';
/** The sample jobs' zone. */
export const TZ = 'America/Los_Angeles';
/** The active special kinds in order: My Daily Reports' list (0084), as ir_form_context answers them. */
const KINDS = [
  { id: 'kind-welding', name: 'Welding' },
  { id: 'kind-bolting', name: 'Bolting' },
  { id: 'kind-concrete', name: 'Concrete' },
  { id: 'kind-masonry', name: 'Masonry' },
  { id: 'kind-grout', name: 'Grout' },
  { id: 'kind-epoxy', name: 'Epoxy' },
  { id: 'kind-soils', name: 'Soils' },
  { id: 'kind-material-id', name: 'Material ID' },
  { id: 'kind-material-id-cwi', name: 'Material ID CWI' },
  { id: 'kind-ut-mp', name: 'UT/MP' },
  { id: 'kind-pull-test', name: 'Pull Test' },
  { id: 'kind-anchors', name: 'Post Inst. Anchor' },
  { id: 'kind-fireproofing', name: 'Fireproofing' },
  { id: 'kind-shotcrete', name: 'Shotcrete' },
  { id: 'kind-rebar', name: 'Rebar ID' },
];

interface IrState {
  requests: IrRowRaw[];
  events: (IrEvent & { request_id: string })[];
  blocks: MockBlock[];
  next: Record<string, number>;
}

/** The start: IR 12 on Sample Job B (a board line points at it) and the calendar's seeded month on both jobs. */
function seeded(): IrState {
  const today = todayInZone(TZ);
  const requests = [SEED_IR, ...seedRequests(today, { 'job-a': 1, [SEED_IR.project_id]: SEED_IR.number + 1 }), ...permitJobRequests(today), ...revsJobRequests(today)];
  const next: Record<string, number> = {};
  for (const r of requests) next[r.project_id] = Math.max(next[r.project_id] ?? 1, r.number + 1);
  return { requests, events: [], blocks: seedBlocks(today), next };
}

function read(): IrState {
  const raw = window.sessionStorage.getItem(KEY);
  if (raw === null) return seeded();
  return { ...seeded(), ...(JSON.parse(raw) as Partial<IrState>) };
}

function write(update: (s: IrState) => IrState): IrState {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function kindName(id: string | null): string | null {
  return KINDS.find((k) => k.id === id)?.name ?? null;
}

function withKind(r: IrRowRaw): IrRequest {
  const name = kindName(r.special_kind_id);
  return { ...r, ir_special_kinds: name === null ? null : { name } };
}

/** ir_status_key (the permits mock reads it from here). */
export { statusKey } from './irRules';

/** The job's calendar rows in a range, as `viewer` may read them (ir_calendar_rows). */
function rowsFor(projectId: string, from: string, to: string, viewer: string | null, team: boolean, decide: boolean): CalendarRow[] {
  const s = read();
  return calendarRows({ requests: s.requests, blocks: s.blocks, kindName }, { projectId, from, to }, { viewer, team, decide });
}

/** has_capability for the ir.* rows, as the signed-in mock user. */
export async function capability(cap: string): Promise<boolean> {
  await delay();
  return holds(mockUser().id, cap);
}

/**
 * calendar_inspections (over ir_calendar): nothing for someone with no inspection right; the deputy's is the OFS
 * requests sent to OFS, in full, with nothing of any other kind and no inspector's blocked time; everyone else's is
 * the job's calendar (in full for the team, my own in full for a requester).
 */
export async function calendar(projectId: string, from: string, to: string): Promise<CalendarRow[]> {
  await delay();
  const me = mockUser().id;
  const decide = holds(me, 'ir.decide');
  const team = decide || holds(me, 'ir.view_all');
  if (holds(me, 'ir.request') || team) return rowsFor(projectId, from, to, me, team, decide);
  if (!holds(me, 'ir.ofs_view') && !holds(me, 'ir.ofs_decide')) return [];
  return rowsFor(projectId, from, to, me, true, false).filter((r) => !r.is_block && r.kind === 'ofs' && r.ofs_sent);
}

/** The job's day as the request link's function reads it for a visitor: time, length, type and color only. */
export async function serverDay(projectId: string, day: string): Promise<CalendarRow[]> {
  await delay();
  return rowsFor(projectId, day, day, null, false, false);
}

export async function formContext(projectId: string): Promise<FormContext> {
  await delay();
  const settings = parseProjectSettings(projectSettings(projectId));
  return {
    gc: 'Sample Builders', inspectors: ['Sample Inspector'], gc_step: settings.ir_gc_approval, ofs: settings.ir_ofs_allowed, kinds: KINDS,
    companies: ['Sample Concrete Co', 'Sample Steel Co'], my_company: 'Sample Concrete Co', today: todayInZone(TZ),
  };
}

/** One request, if the signed-in mock user may read it in full (RLS: ir_may_see). */
export async function request(requestId: string): Promise<IrRequest | null> {
  await delay();
  const r = read().requests.find((x) => x.id === requestId);
  return r && maySee(mockUser().id, r) ? withKind(r) : null;
}

/** The job's requests the signed-in mock user may read in full (RLS). */
export async function list(projectId: string, filter: (r: IrRowRaw) => boolean): Promise<IrRequest[]> {
  await delay();
  const me = mockUser().id;
  return read().requests.filter((r) => r.project_id === projectId && maySee(me, r) && filter(r)).map(withKind);
}

/** One request as the database's own functions read it (a link receipt's request; no caller behind it). */
export async function serverRequest(requestId: string): Promise<IrRequest | null> {
  await delay();
  const r = read().requests.find((x) => x.id === requestId);
  return r ? withKind(r) : null;
}

/** Every request of the job, as the database's own functions read them (the revs status counts them all). */
export async function serverList(projectId: string, filter: (r: IrRowRaw) => boolean): Promise<IrRequest[]> {
  await delay();
  return read().requests.filter((r) => r.project_id === projectId && filter(r)).map(withKind);
}

/** A request's history, for who may read the request. */
export async function events(requestId: string): Promise<IrEvent[]> {
  await delay();
  const s = read();
  const r = s.requests.find((x) => x.id === requestId);
  if (!r || !maySee(mockUser().id, r)) return [];
  return s.events.filter((e) => e.request_id === requestId).reverse();
}

/** ir_recipients: who the results can go to, for the one who decides the request now. */
export async function recipients(requestId: string): Promise<IrRecipient[]> {
  await delay();
  const me = mockUser().id;
  const r = read().requests.find((x) => x.id === requestId);
  if (!r || !ownerOk(me, r)) throw forbidden();
  return [{ member_id: 'member-self', user_id: me, full_name: 'Sample Requester', company: 'Sample Concrete Co', role: 'sub', preselect: true }];
}

function newRow(a: Args, number: number): IrRowRaw {
  const me = mockUser().id;
  const now = new Date().toISOString();
  const str = (k: string): string | null => opt(a, k);
  const kind = str('p_duration_kind') ?? 'timed';
  return {
    id: `mock-ir-${String(number)}`, project_id: str('p_project_id') ?? '', org_id: 'org-sample', number, version: 1,
    requested_by: me, created_by: me, created_at: now, updated_at: now, deleted_at: null, company: str('p_company') ?? '',
    request_date: str('p_request_date') ?? '', start_time: str('p_start_time'), duration_kind: kind,
    duration_min: kind === 'timed' ? (typeof a['p_duration_min'] === 'number' ? a['p_duration_min'] : 60) : null,
    kind: str('p_kind') ?? 'ior', special_kind_id: str('p_special_kind_id'), items: str('p_items') ?? '',
    attachment_ids: Array.isArray(a['p_attachment_ids']) ? (a['p_attachment_ids'] as string[]) : [], notice_ack_at: now,
    status: 'pending', gc_by: null, gc_at: null, gc_note: null, owner_id: null, helper_id: null, confirm_note: null,
    attendance: null, result: null, result_note: null, result_photo_ids: [], result_at: null, result_by: null,
    helper_report: null, helper_note: null, helper_at: null, postpone_reason: null, postpone_note: null, postpone_until: null,
    postponed_at: null, postpone_count: 0, ir_file_id: null, content_hash: null, signed_at: null, signed_by: null,
    pdf_stale: false, pdf_postponed: false, results_sent_at: null, summary: null, permit_id: null,
    requester_name: null, requester_phone: null, requester_email: null, ofs_number: null,
    ofs_sent_at: null, ofs_sent_by: null, special_required: null,
  };
}

/** Every OFS request gets the job's next OFS IR number (the database's trigger, 0056). */
function withOfs(row: IrRowRaw, s: IrState): IrRowRaw {
  if (row.kind !== 'ofs') return row;
  const used = s.requests.filter((r) => r.project_id === row.project_id).map((r) => r.ofs_number ?? 0);
  return { ...row, ofs_number: Math.max(0, ...used) + 1 };
}

/** What ir_first_status reads of the job: its GC step setting, and whether somebody active can do the GC step. */
function jobFacts(projectId: string): { gcStep: boolean; gcApprover: boolean } {
  const revoked = readMock().revoked;
  return {
    gcStep: parseProjectSettings(projectSettings(projectId)).ir_gc_approval,
    gcApprover: MOCK_PEOPLE.some((p) => p.status === 'active' && !revoked.includes(p.member_id) && holds(p.user_id, 'ir.gc_approve')),
  };
}

/**
 * A new request (the shared end of ir_submit, ir_submit_ofs and link_request_make; `by` null: a visitor on the link, who
 * is nobody on the job): an OFS request answers the special inspection question; an inspector's own OFS request needs
 * his one statement and goes straight to OFS; every other request starts where ir_first_status puts it. `a` takes
 * ir_submit's argument names.
 */
function fileRequest(a: Args, by: string | null, patch: Partial<IrRowRaw>): IrRowRaw {
  const projectId = opt(a, 'p_project_id') ?? '';
  const kind = opt(a, 'p_kind') ?? 'ior';
  if (by !== null && !holds(by, 'ir.request')) throw forbidden();
  if (a['p_notice_ack'] !== true) throw refuse('Check the notice box first.');
  if (kind === 'ofs' && !parseProjectSettings(projectSettings(projectId)).ir_ofs_allowed) throw refuse('OFS is off for this job.');
  const special = a['p_special_required'];
  if (kind === 'ofs' && typeof special !== 'boolean') throw refuse('Answer the special inspection question.');
  const sent = kind === 'ofs' && holds(by, 'ir.decide');
  if (sent && a['p_inspector_ack'] !== true) throw refuse("Check the inspector's statement first.");
  const s = read();
  const number = s.next[projectId] ?? 1;
  const fresh = newRow(a, number);
  const row = withOfs(
    {
      ...fresh, status: firstStatus(by, kind, jobFacts(projectId)), special_required: kind === 'ofs' && typeof special === 'boolean' ? special : null,
      ofs_sent_at: sent ? fresh.created_at : null, ofs_sent_by: sent ? by : null, ...patch,
    },
    s,
  );
  write((x) => ({ ...x, requests: [...x.requests, row], next: { ...x.next, [projectId]: number + 1 },
    events: [...x.events, { id: x.events.length + 1, request_id: row.id, action: 'submit', actor_id: by, created_at: row.created_at }] }));
  return row;
}

/** ir_for_update: the request, if the signed-in mock user may read it in full. */
function readable(requestId: unknown): IrRowRaw {
  const r = read().requests.find((x) => x.id === requestId);
  if (!r || !maySee(mockUser().id, r)) throw notFound();
  return r;
}

/** ir_decider, for the walls' results (mock/revRequests): the request, if I decide it now and saw this version. */
export function decider(requestId: string, version: number): IrRowRaw {
  const r = readable(requestId);
  if (r.version !== version) throw conflictError();
  mustDecide(mockUser().id, r);
  return r;
}

/** The IR RPCs, mocked: who may see the request, the version check, the step's own rules (mock/irRules), the history
 *  line. A step that changes nothing answers the row as it is. */
export async function rpc(name: string, a: Args): Promise<IrRowRaw> {
  await delay();
  const me = mockUser().id;
  if (name === 'ir_submit') return fileRequest(a, me, {});
  const step = STEPS[name];
  if (!step) throw notFound();
  const current = readable(a['p_request_id']);
  // The permit link checks the version only once it has something to change (set_request_permit).
  const late = name === 'set_request_permit';
  if (!late && current.version !== a['p_version']) throw conflictError();
  const now = new Date().toISOString();
  const change = step(current, a, {
    me,
    now,
    first: (kind) => firstStatus(me, kind, jobFacts(current.project_id)),
    wallResult: readRevs().cells.some((c) => c.request_id === current.id && c.result !== null),
    permits: { manage: hasPermitRight('permits.manage'), read: hasPermitRight('permits.read') },
  });
  if (change === null) return current;
  if (late && current.version !== a['p_version']) throw conflictError();
  const next: IrRowRaw = { ...current, ...change, version: current.version + 1, updated_at: now };
  write((s) => ({
    ...s,
    requests: s.requests.map((r) => (r.id === next.id ? next : r)),
    events: [...s.events, { id: s.events.length + 1, request_id: next.id, action: actionOf(name, a, change), actor_id: me, created_at: now }],
  }));
  return next;
}

/** ir-pdf 'generate' as ir_sign + ir_attach_pdf record it: the request is complete with its IR on file (no bytes). */
export async function generateIr(requestId: string): Promise<{ id: string }> {
  await delay();
  const me = mockUser().id;
  const r = readable(requestId);
  mustDecide(me, r);
  if (r.result === null) throw refuse('Record the result first.');
  const now = new Date().toISOString();
  const next: IrRowRaw = {
    ...r, status: 'complete', ir_file_id: `mock-ir-pdf-${r.id}`, content_hash: 'sample', signed_at: now, signed_by: me,
    pdf_stale: false, pdf_postponed: r.status === 'postponed', version: r.version + 1, updated_at: now,
  };
  write((s) => ({
    ...s,
    requests: s.requests.map((x) => (x.id === next.id ? next : x)),
    events: [...s.events, { id: s.events.length + 1, request_id: next.id, action: 'pdf', actor_id: me, created_at: now }],
  }));
  return { id: next.id };
}

export async function addBlock(b: NewBlock): Promise<void> {
  await delay();
  write((s) => ({ ...s, blocks: [...s.blocks, {
    id: `mock-block-${String(s.blocks.length + 1)}`, version: 1, project_id: b.projectId, block_date: b.date, start_time: b.startTime,
    end_time: b.endTime, repeat_weekly: b.weekly, deleted: false,
  }] }));
}

export async function removeBlock(id: string): Promise<void> {
  await delay();
  write((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, deleted: true } : b)) }));
}

/** The mock attachments folder (the uploader's mock branch records the file). */
export function folder(projectId: string): string {
  return `${projectId}-inspection-requests`;
}

/** A request sent through the public link with no login (0055): numbered like any, no member behind it, the visitor's
 *  name, phone and email on the row. A visitor is nobody on the job: an OFS request takes the GC step (0061). `a` takes
 *  ir_submit's argument names. */
export async function addLinkRequest(a: Args, who: { name: string; phone: string; email: string }): Promise<IrRowRaw> {
  await delay();
  return fileRequest(a, null, {
    requested_by: null, created_by: null, requester_name: who.name, requester_phone: who.phone === '' ? null : who.phone,
    requester_email: who.email === '' ? null : who.email.toLowerCase(),
  });
}

/** link_request_join (0075): the job's link requests sent from this address become this person's. Answers how many. */
export function claimLinkRequests(projectId: string, email: string, userId: string): number {
  const mine = (r: IrRowRaw) =>
    r.project_id === projectId && r.requested_by === null && r.deleted_at === null && r.requester_email === email.toLowerCase();
  const n = read().requests.filter(mine).length;
  if (n > 0) write((s) => ({ ...s, requests: s.requests.map((r) => (mine(r) ? { ...r, requested_by: userId } : r)) }));
  return n;
}

/** A revs request (0056): an OFS request numbered like any, with the next OFS IR number (mock/revRequests adds its
 *  cells and map). `a` takes ir_submit's argument names. */
export async function addOfsRequest(a: Args): Promise<IrRowRaw> {
  await delay();
  return fileRequest({ ...a, p_kind: 'ofs' }, mockUser().id, {});
}
