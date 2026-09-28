// Mock inspections for e2e: synthetic requests kept in sessionStorage (its own key), the same rules the RPCs apply in
// short form. PDFs and email are server-only and are not mocked.
import { todayInZone } from '../../lib/dates';
import { conflictError } from '../errors';
import type { CalendarRow, FormContext, IrEvent, IrRecipient, IrRequest, IrRowRaw, NewBlock } from '../inspections.types';
import { SEED_IR } from './boardSeeds';
import { mockUser } from './index';
import { delay } from './store';

const KEY = 'e2e-mock-ir';
const TZ = 'America/Los_Angeles';
const KINDS = [
  { id: 'kind-concrete', name: 'Concrete' },
  { id: 'kind-rebar', name: 'Reinforcing steel' },
  { id: 'kind-welding', name: 'Welding' },
];

interface MockBlock {
  id: string;
  version: number;
  project_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  repeat_weekly: boolean;
  deleted: boolean;
}

interface IrState {
  requests: IrRowRaw[];
  events: (IrEvent & { request_id: string })[];
  blocks: MockBlock[];
  next: Record<string, number>;
}

function read(): IrState {
  const raw = window.sessionStorage.getItem(KEY);
  // Sample Job B starts with IR 12 (a board line points at it).
  const empty: IrState = { requests: [SEED_IR], events: [], blocks: [], next: { [SEED_IR.project_id]: SEED_IR.number + 1 } };
  return raw === null ? empty : { ...empty, ...(JSON.parse(raw) as Partial<IrState>) };
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

/** The server's ir_status_key, for the mock. */
function statusKey(r: IrRowRaw): string {
  if (r.status === 'postponed') return 'postponed';
  if (r.status === 'returned') return 'blocked';
  if (r.result === 'approved' || r.result === 'not_approved') return r.result;
  if (r.status === 'confirmed' && r.helper_id !== null) return 'assigned';
  return r.status === 'confirmed' || r.status === 'complete' ? 'confirmed' : 'pending';
}

function toCalendar(r: IrRowRaw): CalendarRow {
  return {
    id: r.id, number: r.number, version: r.version, full_detail: true, mine: r.requested_by === mockUser().id, is_block: false,
    request_date: r.request_date, start_time: r.start_time, duration_kind: r.duration_kind, duration_min: r.duration_min,
    kind: r.kind, special_kind: kindName(r.special_kind_id), status: r.status, status_key: statusKey(r), result: r.result,
    attendance: r.attendance, company: r.company, items: r.items, owner_id: r.owner_id, helper_id: r.helper_id,
    postpone_reason: r.postpone_reason, postpone_until: r.postpone_until,
  };
}

function blockRow(b: MockBlock, day: string): CalendarRow {
  const [sh = 0, sm = 0] = (b.start_time ?? '0:0').split(':').map(Number);
  const [eh = 0, em = 0] = (b.end_time ?? '0:0').split(':').map(Number);
  return {
    id: b.id, number: null, version: b.version, full_detail: true, mine: false, is_block: true, request_date: day,
    start_time: b.start_time, duration_kind: b.start_time === null ? 'all_day' : 'timed',
    duration_min: b.start_time === null ? null : eh * 60 + em - (sh * 60 + sm), kind: 'block', special_kind: null,
    status: 'blocked', status_key: 'blocked', result: null, attendance: null, company: null, items: null, owner_id: null,
    helper_id: null, postpone_reason: null, postpone_until: null,
  };
}

/** Days from `from` to `to` that are the block's day or, when weekly, the same weekday after it. */
function blockDays(b: MockBlock, from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = Date.parse(`${from}T12:00:00Z`); d <= Date.parse(`${to}T12:00:00Z`); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10);
    const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${b.block_date}T12:00:00Z`)) / 86_400_000);
    if (diff === 0 || (b.repeat_weekly && diff > 0 && diff % 7 === 0)) days.push(day);
  }
  return days;
}

export async function calendar(projectId: string, from: string, to: string): Promise<CalendarRow[]> {
  await delay();
  const s = read();
  const rows = s.requests
    .filter((r) => r.project_id === projectId && r.status !== 'withdrawn' && r.request_date >= from && r.request_date <= to)
    .map(toCalendar);
  const blocks = s.blocks.filter((b) => b.project_id === projectId && !b.deleted).flatMap((b) => blockDays(b, from, to).map((d) => blockRow(b, d)));
  return [...rows, ...blocks].sort((a, b) => a.request_date.localeCompare(b.request_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}

export async function formContext(): Promise<FormContext> {
  await delay();
  return {
    gc: 'Sample Builders', inspectors: ['Sample Inspector'], gc_step: false, ofs: false, kinds: KINDS,
    companies: ['Sample Concrete Co', 'Sample Steel Co'], my_company: 'Sample Concrete Co', today: todayInZone(TZ),
  };
}

export async function request(requestId: string): Promise<IrRequest | null> {
  await delay();
  const r = read().requests.find((x) => x.id === requestId);
  return r ? withKind(r) : null;
}

export async function list(projectId: string, filter: (r: IrRowRaw) => boolean): Promise<IrRequest[]> {
  await delay();
  return read().requests.filter((r) => r.project_id === projectId && filter(r)).map(withKind);
}

export async function events(requestId: string): Promise<IrEvent[]> {
  await delay();
  return read().events.filter((e) => e.request_id === requestId).reverse();
}

export async function recipients(): Promise<IrRecipient[]> {
  await delay();
  const me = mockUser().id;
  return [{ member_id: 'member-self', user_id: me, full_name: 'Sample Requester', company: 'Sample Concrete Co', role: 'sub', preselect: true }];
}

function opt(a: Record<string, unknown>, k: string): string | null {
  const v = a[k];
  return typeof v === 'string' ? v : null;
}

function newRow(a: Record<string, unknown>, number: number): IrRowRaw {
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
    pdf_stale: false, pdf_postponed: false, results_sent_at: null, summary: null,
  };
}

type Change = (r: IrRowRaw, a: Record<string, unknown>, me: string) => Partial<IrRowRaw>;

const CHANGES: Record<string, Change> = {
  ir_confirm: (r, a, me) => ({ status: r.ir_file_id ? 'complete' : 'confirmed', owner_id: me, confirm_note: opt(a, 'p_note'), postpone_reason: null, postpone_note: null, postpone_until: null }),
  ir_unconfirm: () => ({ status: 'pending' }),
  ir_set_attendance: (_r, a, me) => ({ attendance: opt(a, 'p_attendance'), owner_id: me }),
  ir_set_result: (r, a, me) => ({
    result: opt(a, 'p_result'), result_note: opt(a, 'p_note'), owner_id: me, status: r.status === 'pending' ? 'confirmed' : r.status,
    result_photo_ids: Array.isArray(a['p_photo_ids']) ? (a['p_photo_ids'] as string[]) : [],
  }),
  ir_postpone: (r, a) => ({
    status: 'postponed', postpone_reason: opt(a, 'p_reason'), postpone_note: opt(a, 'p_note'), postpone_until: opt(a, 'p_until'),
    postpone_count: r.postpone_count + (r.status === 'postponed' ? 0 : 1),
  }),
  ir_move: (r, a) => ({
    request_date: opt(a, 'p_request_date') ?? r.request_date, start_time: opt(a, 'p_start_time'),
    duration_kind: opt(a, 'p_duration_kind') ?? 'timed',
    duration_min: typeof a['p_duration_min'] === 'number' ? a['p_duration_min'] : null,
    status: r.owner_id === mockUser().id ? r.status : 'pending',
  }),
  ir_withdraw: () => ({ status: 'withdrawn' }),
  ir_restore: () => ({ status: 'pending' }),
  ir_gc_decide: (_r, a) => ({ status: a['p_approve'] === true ? 'pending' : 'returned', gc_note: opt(a, 'p_note') }),
  ir_claim: (r, _a, me) => (r.owner_id === null ? { owner_id: me } : { helper_id: me }),
  ir_assign_helper: (_r, a) => ({ helper_id: opt(a, 'p_helper_id') }),
  ir_helper_report: (_r, a) => ({ helper_report: opt(a, 'p_report'), helper_note: opt(a, 'p_note') }),
};

/** The history word the server writes for each RPC. */
function actionOf(name: string, a: Record<string, unknown>): string {
  if (name === 'ir_gc_decide') return a['p_approve'] === true ? 'gc_approve' : 'gc_return';
  const map: Record<string, string> = { ir_set_result: 'result', ir_set_attendance: 'attendance', ir_assign_helper: 'helper' };
  return map[name] ?? name.replace(/^ir_/, '');
}

/** The IR RPCs, mocked: a version check, the change, the history line. */
export async function rpc(name: string, a: Record<string, unknown>): Promise<IrRowRaw> {
  await delay();
  const me = mockUser().id;
  if (name === 'ir_submit') {
    const projectId = opt(a, 'p_project_id') ?? '';
    const number = (read().next[projectId] ?? 1);
    const row = newRow(a, number);
    write((s) => ({ ...s, requests: [...s.requests, row], next: { ...s.next, [projectId]: number + 1 },
      events: [...s.events, { id: s.events.length + 1, request_id: row.id, action: 'submit', actor_id: me, created_at: row.created_at }] }));
    return row;
  }
  const change = CHANGES[name];
  const current = read().requests.find((r) => r.id === a['p_request_id']);
  if (!change || !current) throw new Error('That inspection no longer exists.');
  if (current.version !== a['p_version']) throw conflictError();
  const next: IrRowRaw = { ...current, ...change(current, a, me), version: current.version + 1, updated_at: new Date().toISOString() };
  write((s) => ({
    ...s,
    requests: s.requests.map((r) => (r.id === next.id ? next : r)),
    events: [...s.events, { id: s.events.length + 1, request_id: next.id, action: actionOf(name, a), actor_id: me, created_at: next.updated_at }],
  }));
  return next;
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
