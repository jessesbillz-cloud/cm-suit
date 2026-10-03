// e2e mock of the RFI module (the Sep 28 contract): who holds an RFI, what each person may do (can.*), the tracker,
// waiting reasons and the impact window follow the database's rules, so the e2e walks the same flow. The mock user
// decides the capabilities: 'sub' writes RFIs, 'inspector' reviews (the sample route is one Inspector step), 'pm'
// writes and issues, 'architect' answers, 'bidder' sees nothing. State lives in sessionStorage, never module state.
import { DataError } from '../errors';
import {
  rfiRowSchema,
  type RfiCan,
  type RfiDetail,
  type RfiFileRef,
  type RfiListRow,
  type RfiRow,
  type RfiSettings,
  type RfiWaitingRow,
} from '../rfis.types';
import * as api from './api';
import { MOCK_PEOPLE, MOCK_PROJECTS } from './fixtures';
import { mockUser } from './index';
import { DEFAULT_SETTINGS, ENGINEER, seedState, type JobRfiSettings, type RfiMockState, type StoredRfi, type StoredStep } from './rfiSeeds';
import { delay } from './store';

const KEY = 'e2e-mock-rfis';
const DAY = 86_400_000;
const UNOPENED_AFTER = 2 * DAY;

export function read(): RfiMockState {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seedState(Date.now()) : (JSON.parse(raw) as RfiMockState);
}

export function write(update: (s: RfiMockState) => RfiMockState): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

interface Me {
  id: string;
  role: string;
  caps: readonly string[];
}

const WHO: Record<string, { role: string; caps: readonly string[] }> = {
  pm: { role: 'pm', caps: ['rfi.create_draft', 'rfi.sign_issue'] },
  sub: { role: 'sub', caps: ['rfi.create_draft'] },
  inspector: { role: 'inspector', caps: [] },
  architect: { role: 'architect', caps: ['rfi.answer'] },
  bidder: { role: 'bidder', caps: [] },
  ahj: { role: 'ahj', caps: [] },
  super: { role: 'superintendent', caps: ['rfi.create_draft'] },
  safety: { role: 'safety', caps: [] },
  foreman: { role: 'foreman', caps: ['rfi.create_draft'] },
};

export function me(): Me {
  const id = mockUser().id;
  const who = WHO[id.replace(/^mock-user-/, '')] ?? { role: 'member', caps: ['rfi.create_draft'] };
  return { id, ...who };
}

export function has(cap: string, m: Me = me()): boolean {
  return m.caps.includes(cap);
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

/** A person's role on the job, as the database keeps it (the mock users, then the sample people). */
export function roleOf(userId: string): string | null {
  return WHO[userId.replace(/^mock-user-/, '')]?.role ?? MOCK_PEOPLE.find((p) => p.user_id === userId)?.role ?? null;
}

export function nameOf(userId: string): string {
  if (userId === 'mock-user-architect') return 'Sample Architect';
  if (userId === ENGINEER) return 'Sample Engineer';
  return MOCK_PEOPLE.find((p) => p.user_id === userId)?.full_name ?? 'Sample Member';
}

export function forbidden(): DataError {
  return new DataError("You don't have access to that.", '42501', 'forbidden');
}

export function jobSettings(s: RfiMockState, projectId: string): JobRfiSettings {
  return s.settings[projectId] ?? DEFAULT_SETTINGS;
}

/** The RFI's reviewers: its own copy once sent, else the job's route today. */
export function stepsOf(s: RfiMockState, r: StoredRfi): StoredStep[] {
  return r.status === 'draft' ? jobSettings(s, r.project_id).route : (s.steps[r.id] ?? []);
}

/** Does this person hold the RFI now? */
export function holds(s: RfiMockState, r: StoredRfi, m: Me = me()): boolean {
  switch (r.status) {
    case 'draft':
    case 'answered':
      return r.created_by === m.id;
    case 'review': {
      const step = stepsOf(s, r)[r.step - 1];
      return step !== undefined && (step.role === m.role || step.user_id === m.id);
    }
    case 'issue':
      return has('rfi.sign_issue', m);
    case 'open':
      return has('rfi.answer', m);
    default:
      return false;
  }
}

function holderLabel(s: RfiMockState, r: StoredRfi): string {
  if (r.status === 'draft' || r.status === 'answered') return nameOf(r.created_by);
  if (r.status === 'review') return stepsOf(s, r)[r.step - 1]?.label ?? '';
  if (r.status === 'issue') return 'PM / PE';
  if (r.status === 'open') return 'Architect';
  return '';
}

export function visible(s: RfiMockState, r: StoredRfi, m: Me = me()): boolean {
  if (r.created_by === m.id || has('rfi.sign_issue', m)) return true;
  if (r.status === 'draft') return false;
  if (has('rfi.answer', m) && ['open', 'answered', 'closed'].includes(r.status)) return true;
  return (s.steps[r.id] ?? []).some((st) => st.role === m.role || st.user_id === m.id);
}

export function strip(r: StoredRfi): RfiRow {
  return rfiRowSchema.parse(r);
}

export function find(s: RfiMockState, id: string): StoredRfi {
  const r = s.rfis.find((x) => x.id === id);
  if (!r || !visible(s, r, me())) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
  return r;
}

function can(s: RfiMockState, r: StoredRfi, m: Me): RfiCan {
  const mine = r.created_by === m.id;
  const holder = holds(s, r, m);
  const issuer = has('rfi.sign_issue', m);
  const windowOpen = r.impact_until !== null && Date.now() <= Date.parse(r.impact_until);
  return {
    edit: holder && ['draft', 'review', 'issue'].includes(r.status),
    send: mine && r.status === 'draft',
    forward: holder && r.status === 'review',
    send_back: holder && (r.status === 'review' || r.status === 'issue'),
    issue: issuer && r.status === 'issue',
    answer: has('rfi.answer', m) && r.status === 'open',
    claim_impact: mine && (r.status === 'answered' || r.status === 'closed') && windowOpen && r.impact_claimed_at === null,
    close: r.status === 'answered' && (mine || issuer),
    void: (issuer && r.status !== 'closed' && r.status !== 'void') || (mine && r.status === 'draft'),
    gc_note: issuer && r.impact_claimed_at !== null,
  };
}

function listRow(s: RfiMockState, r: StoredRfi, m: Me): RfiListRow {
  return {
    id: r.id, number: r.number, status: r.status, title: r.title, created_by: r.created_by, originator_name: nameOf(r.created_by),
    created_at: r.created_at, sent_at: r.sent_at, issued_at: r.issued_at, due_at: r.due_at, answered_at: r.answered_at,
    closed_at: r.closed_at, holder_label: holderLabel(s, r), held_since: r.held_since, held_opened_at: r.held_opened_at,
    is_mine_to_act: holds(s, r, m), impact_claimed_at: r.impact_claimed_at, impact_until: r.impact_until, version: r.version,
  };
}

export async function list(projectId: string): Promise<RfiListRow[]> {
  await delay();
  const s = read();
  const m = me();
  return s.rfis.filter((r) => r.project_id === projectId && visible(s, r, m)).map((r) => listRow(s, r, m));
}

/** The tracker: Originator, the reviewers, Issue, Architect, Answered; done steps carry who and when. */
function route(s: RfiMockState, r: StoredRfi): RfiDetail['route'] {
  const reviewers = stepsOf(s, r);
  const labels = ['Originator', ...reviewers.map((x) => x.label), 'Issue (PM / PE)', 'Architect', 'Answered'];
  const n = reviewers.length;
  const at: Record<string, number> = { draft: 0, review: r.step, issue: n + 1, open: n + 2, answered: n + 3, closed: n + 4 };
  const current = at[r.status] ?? -1;
  // Newest first: a step done twice (sent back, sent again) shows its latest.
  const events = s.events.filter((e) => e.rfi_id === r.id).reverse();
  const doneEvent = (i: number) => {
    if (i === 0) return events.find((e) => e.kind === 'sent');
    if (i <= n) return events.find((e) => e.kind === 'forwarded' && e.step === i);
    const kind = (['issued', 'answered', 'closed'] as const)[i - n - 1];
    return events.find((e) => e.kind === kind);
  };
  return labels.map((label, i) => {
    const done = r.status === 'void' ? doneEvent(i) !== undefined : i < current;
    const e = done ? doneEvent(i) : undefined;
    const state = done ? 'done' : i === current ? 'current' : 'next';
    return { position: i, label, state, done_by_name: e ? nameOf(e.actor) : null, done_at: e?.at ?? null };
  });
}

async function fileRefs(ids: readonly string[]): Promise<RfiFileRef[]> {
  const rows = await Promise.all(ids.map((id) => api.file(id)));
  return rows.flatMap((f) => (f ? [{ id: f.id, original_name: f.original_name, mime: f.mime }] : []));
}

/** Reading it as the holder records the first open of this hold. */
export async function detail(rfiId: string): Promise<RfiDetail> {
  await delay();
  const m = me();
  let r = find(read(), rfiId);
  if (holds(read(), r, m) && r.held_opened_at === null) {
    const at = new Date().toISOString();
    r = { ...r, held_opened_at: at };
    const opened = r;
    write((s) => ({
      ...s,
      rfis: s.rfis.map((x) => (x.id === rfiId ? opened : x)),
      events: [...s.events, { rfi_id: rfiId, at, actor: m.id, kind: 'opened', step: opened.step, note: null }],
    }));
  }
  const s = read();
  const eventOf = (kind: string) => [...s.events].reverse().find((e) => e.rfi_id === rfiId && e.kind === kind);
  const issued = eventOf('issued');
  const answered = eventOf('answered');
  const settings = jobSettings(s, r.project_id);
  return {
    rfi: strip(r),
    originator_name: nameOf(r.created_by),
    issuer_name: issued ? nameOf(issued.actor) : null,
    answerer_name: answered ? nameOf(answered.actor) : null,
    holder_label: holderLabel(s, r),
    is_mine_to_act: holds(s, r, m),
    can: can(s, r, m),
    route: route(s, r),
    events: s.events
      .filter((e) => e.rfi_id === rfiId)
      .map((e) => ({ at: e.at, kind: e.kind, actor_name: nameOf(e.actor), note: e.note, step: e.step })),
    photos: await fileRefs(r.photo_ids),
    answer_files: await fileRefs(r.answer_file_ids),
    settings: { answer_days: settings.answer_days, impact_days: settings.impact_days },
  };
}

export function settingsOut(v: JobRfiSettings): RfiSettings {
  return { answer_days: v.answer_days, impact_days: v.impact_days, version: v.version, route: v.route };
}

export async function settingsFor(projectId: string): Promise<RfiSettings> {
  await delay();
  return settingsOut(jobSettings(read(), projectId));
}

/** RFIs I sent or may issue, held by someone else, late or not opened for 2 days: late first, then oldest. */
export async function waiting(): Promise<RfiWaitingRow[]> {
  await delay();
  const s = read();
  const m = me();
  const now = Date.now();
  const rows = s.rfis.flatMap((r): RfiWaitingRow[] => {
    if (!['review', 'issue', 'open'].includes(r.status) || holds(s, r, m)) return [];
    if (r.created_by !== m.id && !has('rfi.sign_issue', m)) return [];
    const late = r.due_at !== null && Date.parse(r.due_at) < now;
    const unopened = r.held_opened_at === null && r.held_since !== null && Date.parse(r.held_since) < now - UNOPENED_AFTER;
    if (!late && !unopened) return [];
    const project_name = MOCK_PROJECTS.find((p) => p.project_id === r.project_id)?.name ?? '';
    const { id, project_id, number, title, status, held_since, held_opened_at, due_at } = r;
    return [{ id, project_id, project_name, number, title, status, holder_label: holderLabel(s, r), held_since, held_opened_at, due_at, reason: late ? 'late' : 'unopened' }];
  });
  const rank = (w: RfiWaitingRow) => (w.reason === 'late' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || Date.parse(a.held_since ?? '') - Date.parse(b.held_since ?? ''));
}

export async function folder(projectId: string): Promise<string> {
  await delay();
  if (!has('rfi.create_draft') && !has('rfi.answer')) throw forbidden();
  return `${projectId}-rfis`;
}

export async function fileBlob(fileId: string): Promise<{ blob: Blob; filename: string }> {
  return api.download(fileId);
}
