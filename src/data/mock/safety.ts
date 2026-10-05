// e2e mock of Safety (0060) with the database's rules in short form: safety.read for every mock user but the bidder, the
// requester and the visitor; safety.run for the PM, the super and the safety manager; safety.manage for the safety
// manager; the job's next number; one line per name; the leader (or a manager) ticks in, removes and closes; Undo a
// close within 15 minutes; the sheet as a synthetic PDF. State lives in sessionStorage (its own key), never module state.
import { conflictError, DataError } from '../errors';
import { todayInZone } from '../../lib/dates';
import type { LinkToken, Meeting, MeetingKey, MeetingRow, PublicMeeting, Reopened, SafetyDue, Signin, SignInput, StartInput, Started, Topic, TopicInput } from '../safety.types';
import { MOCK_PEOPLE } from './fixtures';
import { mockUser } from './index';
import { DAY, HOUR, seedMeetings, STARTER_TOPICS, TZ, type StoredMeeting, type StoredSignin } from './safetySeeds';
import { delay } from './store';

const KEY = 'e2e-mock-safety';

interface SafetyMock {
  meetings: StoredMeeting[];
  signins: StoredSignin[];
  /** The company's own topics. */
  topics: Topic[];
  seq: number;
}

function read(): SafetyMock {
  const raw = window.sessionStorage.getItem(KEY);
  if (raw !== null) return JSON.parse(raw) as SafetyMock;
  return { ...seedMeetings(Date.now(), (d) => todayInZone(TZ, d)), topics: [], seq: 100 };
}

function write(update: (s: SafetyMock) => SafetyMock): SafetyMock {
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
  if (cap === 'safety.read') return true;
  if (cap === 'safety.run') return ['pm', 'super', 'safety'].includes(r);
  return cap === 'safety.manage' && r === 'safety';
}

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

function need(cap: string): void {
  if (!has(cap)) throw new DataError("You don't have access to that.", '42501', 'forbidden');
}

function meetingOf(s: SafetyMock, id: string): StoredMeeting {
  const m = s.meetings.find((x) => x.id === id);
  if (!m) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
  return m;
}

function canLead(m: StoredMeeting): boolean {
  return (m.leader_id === mockUser().id && has('safety.run')) || has('safety.manage');
}

function lead(s: SafetyMock, id: string): StoredMeeting {
  const m = meetingOf(s, id);
  if (!canLead(m)) throw new DataError("You don't have access to that.", '42501', 'forbidden');
  return m;
}

function bump(m: StoredMeeting, patch: Partial<StoredMeeting>): StoredMeeting {
  return { ...m, ...patch, version: m.version + 1 };
}

function lines(s: SafetyMock, meetingId: string): StoredSignin[] {
  return s.signins.filter((x) => x.meeting_id === meetingId && !x.removed);
}

/** A 43-character token, like the database's. */
function newToken(s: SafetyMock): string {
  return `sample-meeting-token-${String(s.seq)}`.padEnd(43, '0');
}

export async function meetings(projectId: string): Promise<MeetingRow[]> {
  await delay();
  need('safety.read');
  const s = read();
  return s.meetings
    .filter((m) => m.project_id === projectId)
    .sort((a, b) => b.number - a.number)
    .map((m) => ({
      id: m.id, number: m.number, kind: m.kind, held_on: m.held_on, title: m.title, status: m.status, leader_id: m.leader_id,
      leader_name: m.leader_name, opened_at: m.opened_at, closed_at: m.closed_at, signed: lines(s, m.id).length, version: m.version,
    }));
}

export async function meeting(meetingId: string): Promise<Meeting> {
  await delay();
  need('safety.read');
  const m = meetingOf(read(), meetingId);
  return {
    id: m.id, project_id: m.project_id, number: m.number, kind: m.kind, held_on: m.held_on, topic_id: m.topic_id, title: m.title,
    notes: m.notes, points: m.points, questions: m.questions, source: m.source, source_url: m.source_url, file_id: m.file_id,
    topic_file: false, leader_id: m.leader_id, leader_name: m.leader_name, location: m.location, status: m.status,
    opened_at: m.opened_at, closed_at: m.closed_at, closed_by: m.closed_by, closed_by_name: m.closed_by ? m.leader_name : null,
    token_made_at: m.token_made_at, pdf_file_id: m.pdf_file_id, version: m.version, can_lead: canLead(m),
  };
}

export async function roster(meetingId: string, full: boolean): Promise<Signin[]> {
  await delay();
  need('safety.read');
  return lines(read(), meetingId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((x) => {
      const line: Signin = {
        id: x.id, name: x.name, company: x.company, trade: x.trade, via: x.via, person_id: x.person_id, signed_at: x.signed_at,
        created_at: x.created_at,
      };
      return full ? { ...line, signature: x.signature } : line;
    });
}

export async function topics(): Promise<Topic[]> {
  await delay();
  return [...STARTER_TOPICS, ...read().topics].sort((a, b) => a.title.localeCompare(b.title));
}

/** The 10th working day after the last closed tailgate (the database's safety_due_on). */
function dueOn(last: string | null, today: string): string {
  if (last === null) return today;
  let d = Date.parse(`${last}T12:00:00Z`);
  for (let n = 0; n < 10; ) {
    d += DAY;
    const dow = new Date(d).getUTCDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return new Date(d).toISOString().slice(0, 10);
}

export async function due(projectId: string): Promise<SafetyDue> {
  await delay();
  const s = read();
  const mine = s.meetings.filter((m) => m.project_id === projectId);
  const last = mine.filter((m) => m.kind === 'tailgate' && m.status === 'closed').map((m) => m.held_on).sort().pop() ?? null;
  const today = todayInZone(TZ);
  return { today, last_held_on: last, due_on: dueOn(last, today), open_count: mine.filter((m) => m.status === 'open').length };
}

export async function start(projectId: string, v: StartInput): Promise<Started> {
  await delay();
  need('safety.run');
  const topic = v.topicId === null ? null : (await topics()).find((t) => t.id === v.topicId) ?? null;
  const title = v.title.trim() || topic?.title || '';
  if (title === '') throw new DataError('Name the topic.', '22023', 'Name the topic.');
  const now = new Date().toISOString();
  const s = write((x) => ({ ...x, seq: x.seq + 1 }));
  const token = newToken(s);
  const number = Math.max(0, ...s.meetings.filter((m) => m.project_id === projectId).map((m) => m.number)) + 1;
  const me = mockUser().id;
  const m: StoredMeeting = {
    id: `mock-meeting-${String(s.seq)}`, project_id: projectId, number, kind: v.kind, held_on: todayInZone(TZ), topic_id: topic?.id ?? null,
    title, notes: v.notes.trim(), points: topic?.points ?? [], questions: topic?.questions ?? [], source: topic?.source ?? null,
    source_url: topic?.source_url ?? null, file_id: v.fileId, leader_id: me,
    leader_name: MOCK_PEOPLE.find((p) => p.user_id === me)?.full_name ?? 'Sample Lead', location: v.location.trim(), status: 'open',
    opened_at: now, closed_at: null, closed_by: null, token, token_made_at: now, pdf_file_id: null, version: 2,
  };
  write((x) => ({ ...x, meetings: [...x.meetings, m] }));
  return { id: m.id, number, token, token_made_at: now };
}

export async function qr(meetingId: string): Promise<LinkToken> {
  await delay();
  const s = write((x) => ({ ...x, seq: x.seq + 1 }));
  const m = lead(s, meetingId);
  if (m.status !== 'open') throw new DataError('This meeting is closed.', '22023', 'closed');
  const token = newToken(s);
  const at = new Date().toISOString();
  write((x) => ({ ...x, meetings: x.meetings.map((y) => (y.id === m.id ? bump(y, { token, token_made_at: at }) : y)) }));
  return { token, token_made_at: at };
}

export async function tick(meetingId: string, personId: string): Promise<void> {
  await delay();
  const s = read();
  const m = lead(s, meetingId);
  const p = MOCK_PEOPLE.find((x) => x.user_id === personId);
  if (!p || m.status !== 'open') throw new DataError('Pick someone on this job.', '22023', 'tick');
  const same = lines(s, m.id).find((x) => x.person_id === personId || x.name.toLowerCase() === p.full_name.toLowerCase());
  if (same) return;
  const at = new Date().toISOString();
  const line: StoredSignin = {
    id: `mock-signin-${String(s.seq + s.signins.length)}`, meeting_id: m.id, name: p.full_name, company: p.company, trade: '', via: 'member',
    person_id: personId, signed_at: null, created_at: at, signature: null, removed: false,
  };
  write((x) => ({ ...x, signins: [...x.signins, line] }));
}

export async function removeLine(signinId: string, removed: boolean): Promise<void> {
  await delay();
  const s = read();
  const line = s.signins.find((x) => x.id === signinId);
  if (!line) throw new DataError('That item no longer exists.', 'P0002', 'not_found');
  lead(s, line.meeting_id);
  write((x) => ({ ...x, signins: x.signins.map((y) => (y.id === signinId ? { ...y, removed } : y)) }));
}

function sheetId(m: StoredMeeting): string {
  return `mock-safety-sheet-${m.id}-${String(m.version)}`;
}

export async function close(meetingId: string, version: number): Promise<{ file_id: string }> {
  await delay();
  const m = lead(read(), meetingId);
  if (m.status === 'open' && m.version !== version) throw conflictError();
  const closed = m.status === 'closed' ? m : bump(m, { status: 'closed', closed_at: new Date().toISOString(), closed_by: mockUser().id, token: null, token_made_at: null });
  const done = { ...closed, pdf_file_id: closed.pdf_file_id ?? sheetId(closed) };
  write((x) => ({ ...x, meetings: x.meetings.map((y) => (y.id === m.id ? done : y)) }));
  return { file_id: done.pdf_file_id };
}

export async function render(meetingId: string): Promise<{ file_id: string }> {
  return close(meetingId, 0);
}

export async function reopen(meetingId: string): Promise<Reopened> {
  await delay();
  const s = write((x) => ({ ...x, seq: x.seq + 1 }));
  const m = lead(s, meetingId);
  if (m.status !== 'closed' || m.closed_by !== mockUser().id || Date.parse(m.closed_at ?? '') < Date.now() - 0.25 * HOUR) {
    throw new DataError('Too late to undo.', '22023', 'reopen');
  }
  const token = newToken(s);
  const at = new Date().toISOString();
  const open = bump(m, { status: 'open', closed_at: null, closed_by: null, token, token_made_at: at, pdf_file_id: null });
  write((x) => ({ ...x, meetings: x.meetings.map((y) => (y.id === m.id ? open : y)) }));
  return { token, token_made_at: at, version: open.version };
}

export async function saveTopic(v: TopicInput): Promise<{ id: string; version: number }> {
  await delay();
  need('safety.manage');
  const s = write((x) => ({ ...x, seq: x.seq + 1 }));
  const old = s.topics.find((t) => t.id === v.id);
  if (v.id !== null && !old) throw new DataError('Built-in topics stay as they are.', '42501', 'builtin');
  if (old && old.version !== v.version) throw conflictError();
  const topic: Topic = {
    id: old?.id ?? `mock-topic-own-${String(s.seq)}`, org_id: 'org-sample', slug: null, category: v.category, title: v.title.trim(),
    language: 'en', points: v.points, questions: v.questions, source: v.source.trim() || null, source_url: v.sourceUrl.trim() || null,
    file_id: v.fileId, version: (old?.version ?? 0) + 1,
  };
  write((x) => ({ ...x, topics: [...x.topics.filter((t) => t.id !== topic.id), topic] }));
  return { id: topic.id, version: topic.version };
}

export async function removeTopic(id: string, removed: boolean, kept: Topic | null): Promise<void> {
  await delay();
  need('safety.manage');
  write((x) => ({ ...x, topics: removed ? x.topics.filter((t) => t.id !== id) : kept ? [...x.topics, kept] : x.topics }));
}

/** A sheet or a talk's PDF as a synthetic file. */
export async function fileBlob(fileId: string): Promise<{ blob: Blob; filename: string }> {
  await delay();
  const m = read().meetings.find((x) => x.pdf_file_id === fileId);
  const name = m ? `${m.kind === 'tailgate' ? 'Tailgate' : 'Meeting'} ${String(m.number).padStart(3, '0')} Sample Job A.pdf` : 'Sample talk.pdf';
  return { blob: new Blob([`Synthetic e2e sign-in sheet ${fileId}\n`], { type: 'application/pdf' }), filename: name };
}

/** The public page (no session): the meeting by its token, while it takes signatures. */
function byToken(s: SafetyMock, key: MeetingKey): StoredMeeting {
  const m = s.meetings.find((x) => x.id === key.meetingId && x.status === 'open' && x.token === key.token);
  if (!m) throw new DataError('This sign-in has ended. Ask the person running the meeting.', 'P0002', 'ended');
  return m;
}

export async function publicOpen(key: MeetingKey): Promise<PublicMeeting> {
  await delay();
  const m = byToken(read(), key);
  return { project_name: 'Sample Job A', number: m.number, kind: m.kind, title: m.title, held_on: m.held_on, open: true };
}

export async function publicSign(key: MeetingKey, v: SignInput): Promise<void> {
  await delay();
  const s = read();
  const m = byToken(s, key);
  const name = v.name.trim().replace(/\s+/g, ' ');
  const same = lines(s, m.id).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (same) {
    // Ticked in by the leader: the signature completes that line (the database's link_meeting_sign).
    if (same.signature === null) {
      const at = new Date().toISOString();
      write((x) => ({ ...x, signins: x.signins.map((y) => (y.id === same.id ? { ...y, signature: v.signature, signed_at: at } : y)) }));
    }
    return;
  }
  const at = new Date().toISOString();
  const line: StoredSignin = {
    id: `mock-signin-${String(s.seq)}-${String(s.signins.length)}`, meeting_id: m.id, name, company: v.company.trim(), trade: v.trade.trim(),
    via: 'link', person_id: null, signed_at: at, created_at: at, signature: v.signature, removed: false,
  };
  write((x) => ({ ...x, signins: [...x.signins, line] }));
}

export function folder(projectId: string): string {
  return `${projectId}-safety`;
}

/** The open meetings I lead, for the rail's badge (my_tool_counts). */
/** The roles holding corrections.mark_ready (a synthetic copy of the matrix's row). */
export async function builderRoles(): Promise<string[]> {
  await delay();
  return ['project_admin', 'pm', 'pe', 'superintendent', 'foreman', 'sub'];
}

/** Where the job's latest meeting with a location was held. */
export async function lastLocation(projectId: string): Promise<string> {
  await delay();
  need('safety.read');
  const held = read().meetings.filter((m) => m.project_id === projectId && m.location.trim() !== '');
  held.sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));
  return held[0]?.location ?? '';
}

export function myOpenMeetings(projectId: string | null): string[] {
  const me = mockUser().id;
  return read().meetings.filter((m) => m.leader_id === me && m.status === 'open' && (projectId === null || m.project_id === projectId)).map((m) => m.id);
}
