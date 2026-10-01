// e2e mock of rfi_progress (0049): every step of every RFI I may see on the job, by the database's rules. The current
// pass only (from the latest "Send back"), labels as the database writes them, and whole days on the job's clock: 0
// under 24 hours, else the calendar days between the two moments in the job's zone. Void: what was left is done.
import { formatInZone } from '../../lib/dates';
import type { RfiProgressRow, RfiStepKind, RouteState } from '../rfis.types';
import { MOCK_PROJECTS } from './fixtures';
import { nameOf, read, roleOf, stepsOf, visible } from './rfis';
import type { RfiMockState, StoredRfi } from './rfiSeeds';
import { delay } from './store';

const DAY = 86_400_000;

type MockEvent = RfiMockState['events'][number];

/** 'pe' -> 'PE', 'project_admin' -> 'Project admin' (the database's rfi_role_label). */
function roleLabel(role: string): string {
  return role.length <= 2 ? role.toUpperCase() : role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
}

function personLabel(userId: string): string {
  const role = roleOf(userId);
  return role === null ? nameOf(userId) : roleLabel(role);
}

function wholeDays(from: string, to: string, tz: string): number {
  if (Date.parse(to) - Date.parse(from) < DAY) return 0;
  const a = Date.parse(`${formatInZone(from, tz, 'yyyy-MM-dd')}T00:00:00Z`);
  const b = Date.parse(`${formatInZone(to, tz, 'yyyy-MM-dd')}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / DAY));
}

interface Raw {
  kind: RfiStepKind;
  label: string;
  /** Who did it (or holds it, for the originator and a named person). */
  by: string | null;
  named: string | null;
  left: string | null;
}

function latest(events: readonly MockEvent[], test: (e: MockEvent) => boolean): MockEvent | undefined {
  return [...events].reverse().find(test);
}

function rawSteps(s: RfiMockState, r: StoredRfi, events: readonly MockEvent[]): Raw[] {
  const sent = r.sent_at;
  const inPass = (e: MockEvent) => sent !== null && Date.parse(e.at) >= Date.parse(sent);
  const issued = r.issued_at === null ? undefined : latest(events, (e) => e.kind === 'issued');
  const answered = r.answered_at === null ? undefined : latest(events, (e) => e.kind === 'answered');
  return [
    { kind: 'ask', label: personLabel(r.created_by), by: r.created_by, named: null, left: sent },
    ...stepsOf(s, r).map((st): Raw => {
      const f = latest(events, (e) => e.kind === 'forwarded' && e.step === st.position && inPass(e));
      return { kind: 'review', label: st.label, by: f?.actor ?? null, named: st.user_id, left: f?.at ?? null };
    }),
    { kind: 'issue', label: issued ? personLabel(issued.actor) : 'PM / PE', by: issued?.actor ?? null, named: null, left: r.issued_at },
    { kind: 'answer', label: 'Architect', by: answered?.actor ?? null, named: null, left: r.answered_at },
    { kind: 'answered', label: r.status === 'closed' ? 'Closed' : 'Answered', by: null, named: null, left: null },
  ];
}

function current(r: StoredRfi, n: number): number {
  switch (r.status) {
    case 'draft':
      return 0;
    case 'review':
      return r.step;
    case 'issue':
      return n + 1;
    case 'open':
      return n + 2;
    default:
      return n + 4;
  }
}

function rowsOf(s: RfiMockState, r: StoredRfi, tz: string, now: string): RfiProgressRow[] {
  const events = s.events.filter((e) => e.rfi_id === r.id);
  const began = latest(events, (e) => e.kind === 'returned')?.at ?? r.created_at;
  const raw = rawSteps(s, r, events);
  // raw = the originator, n reviewers, issue, the architect and the end.
  const cur = current(r, raw.length - 4);
  return raw.map((x, i) => {
    const entered = i === 0 ? began : (raw[i - 1]?.left ?? null);
    const state: RouteState = r.status === 'void' ? (x.left !== null ? 'done' : 'next') : i < cur ? 'done' : i === cur ? 'current' : 'next';
    const left = state === 'done' && x.kind !== 'answered' ? x.left : null;
    const person = state === 'done' && x.by !== null ? x.by : state === 'current' ? (x.kind === 'ask' ? x.by : x.named) : null;
    const timed = state !== 'next' && x.kind !== 'answered' && entered !== null && !(state === 'done' && left === null);
    return {
      rfi_id: r.id,
      position: i,
      kind: x.kind,
      label: x.label,
      person_name: person === null ? null : nameOf(person),
      state,
      entered_at: state === 'next' ? null : entered,
      left_at: left,
      days: timed ? wholeDays(entered, left ?? now, tz) : null,
      due_at: r.due_at,
    };
  });
}

export async function progress(projectId: string): Promise<RfiProgressRow[]> {
  await delay();
  const s = read();
  const tz = MOCK_PROJECTS.find((p) => p.project_id === projectId)?.timezone ?? 'America/Los_Angeles';
  const now = new Date().toISOString();
  return s.rfis.filter((r) => r.project_id === projectId && visible(s, r)).flatMap((r) => rowsOf(s, r, tz, now));
}
