// e2e mock of permits (0052) with the database's rules: the log and the caseload by number, the trackers, one permit in
// full, who can be assigned, a new permit (the official only; numbers unique per job; the form's key returns the same
// row), edits with a version check, moves along permit_next_stages (the same move again is a no-op) and Undo of my own
// last move. Reviews, comments and linked inspections are in mock/permitReviews.
import { conflictError } from '../errors';
import type { NewPermitInput, PermitDetail, PermitEdit, PermitListRow, PermitPerson, PermitRef, PermitRow, PermitStep } from '../permits.types';
import { todayInZone } from '../../lib/dates';
import { mockUser } from './index';
import * as inspections from './inspections';
import { permitJobName, permitJobRows, permitJobZone } from './permitJobs';
import { permitSteps } from './permitProgress';
import { OFFICIAL, OFFICIAL_2, yearOn, type PermitMockState, type StoredPermit } from './permitSeeds';
import { fail, has, mustHave, nameOf, read, readable, stored, write } from './permitStore';
import { delay } from './store';

export async function capability(cap: string): Promise<boolean> {
  await delay();
  return has(cap);
}

/** permit_next_stages, the usual next stage first. */
const NEXT: Record<string, readonly string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['accepted', 'rejected', 'cancelled'],
  rejected: ['submitted', 'cancelled'],
  accepted: ['in_review', 'cancelled'],
  in_review: ['comments_out', 'issued', 'cancelled'],
  comments_out: ['backcheck', 'cancelled'],
  backcheck: ['in_review', 'comments_out', 'issued', 'cancelled'],
  issued: ['inspections', 'cancelled'],
  inspections: ['approved', 'cancelled'],
  approved: ['complete', 'cancelled'],
};

function rowOf(p: StoredPermit): PermitRow {
  return {
    id: p.id, project_id: p.project_id, primary_number: p.primary_number, agency_numbers: p.agency_numbers, title: p.title,
    kind: p.kind, stage: p.stage, stage_since: p.stage_since, assigned_to: p.assigned_to, issued_on: p.issued_on,
    expires_on: p.expires_on, extensions: p.extensions, notes: p.notes, created_by: p.created_by, created_at: p.created_at,
    version: p.version,
  };
}

function listRow(s: PermitMockState, p: StoredPermit): PermitListRow {
  return {
    id: p.id, project_id: p.project_id, project_name: permitJobName(p.project_id), timezone: permitJobZone(p.project_id),
    primary_number: p.primary_number,
    agency_numbers: p.agency_numbers, title: p.title, kind: p.kind, stage: p.stage, stage_since: p.stage_since,
    assigned_to: p.assigned_to, assigned_name: nameOf(p.assigned_to), issued_on: p.issued_on, expires_on: p.expires_on,
    extensions: p.extensions, open_comments: s.comments.filter((c) => c.permit_id === p.id && c.status === 'open').length,
    review_cycle: Math.max(0, ...s.reviews.filter((r) => r.permit_id === p.id).map((r) => r.cycle)), version: p.version,
  };
}

function visible(s: PermitMockState, projectId: string | null): StoredPermit[] {
  return s.permits
    .filter((p) => (projectId === null || p.project_id === projectId) && readable(p.project_id))
    .sort((a, b) => a.primary_number.toLowerCase().localeCompare(b.primary_number.toLowerCase()) || a.project_id.localeCompare(b.project_id));
}

export async function list(projectId: string | null): Promise<PermitListRow[]> {
  await delay();
  const s = read();
  return visible(s, projectId).map((p) => listRow(s, p));
}

export async function progress(projectId: string | null, permitId: string | null): Promise<PermitStep[]> {
  await delay();
  const s = read();
  return visible(s, projectId)
    .filter((p) => permitId === null || p.id === permitId)
    .flatMap((p) => permitSteps(p, s.events, permitJobZone(p.project_id), new Date()));
}

export async function people(projectId: string): Promise<PermitPerson[]> {
  await delay();
  if (!readable(projectId)) return [];
  return [OFFICIAL, OFFICIAL_2].map((id) => ({ user_id: id, name: nameOf(id) ?? '' }));
}

export async function detail(id: string): Promise<PermitDetail> {
  await delay();
  const s = read();
  const p = stored(s, id);
  const manage = has('permits.manage');
  const linked = await inspections.list(p.project_id, (r) => r.permit_id === p.id);
  const open = manage ? await inspections.list(p.project_id, (r) => r.permit_id === null && r.status !== 'withdrawn') : [];
  const link = (r: (typeof linked)[number]) => ({
    id: r.id, number: r.number, kind: r.kind, special_kind: r.ir_special_kinds?.name ?? null, request_date: r.request_date,
    items: r.items, status_key: inspections.statusKey(r), version: r.version,
  });
  const newest = (a: { request_date: string }, b: { request_date: string }) => b.request_date.localeCompare(a.request_date);
  return {
    permit: rowOf(p),
    project_name: permitJobName(p.project_id),
    timezone: permitJobZone(p.project_id),
    assigned_name: nameOf(p.assigned_to),
    created_by_name: nameOf(p.created_by) ?? '',
    can: { manage, respond: has('permits.respond'), link: manage },
    moves: manage ? [...(NEXT[p.stage] ?? [])] : [],
    steps: permitSteps(p, s.events, permitJobZone(p.project_id), new Date()),
    reviews: s.reviews
      .filter((r) => r.permit_id === p.id)
      .sort((a, b) => b.cycle - a.cycle)
      .map((r) => ({
        id: r.id, permit_id: r.permit_id, cycle: r.cycle, kind: r.kind, received_on: r.received_on, returned_on: r.returned_on,
        outcome: r.outcome, version: r.version,
        comments: s.comments
          .filter((c) => c.review_id === r.id)
          .sort((a, b) => a.number - b.number)
          .map((c) => ({ ...c, responded_by_name: nameOf(c.responded_by) })),
      })),
    events: s.events.filter((e) => e.permit_id === p.id).map((e) => ({ stage: e.stage, at: e.at, by_name: nameOf(e.actor), note: e.note, undone: e.undone })),
    inspections: [...linked].sort(newest).map(link),
    linkable: [...open].sort(newest).slice(0, 50).map(link),
  };
}

function checkFields(s: PermitMockState, projectId: string, number: string, title: string, except: string | null): void {
  if (number.trim() === '') throw fail('Add the permit number.');
  if (title.trim() === '') throw fail('Add what it covers.');
  const n = number.trim().toLowerCase();
  if (s.permits.some((p) => p.project_id === projectId && p.id !== except && p.primary_number.toLowerCase() === n)) {
    throw fail(`Permit ${number.trim()} is already on this job.`);
  }
}

function otherNumbers(primary: string, numbers: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of numbers.map((x) => x.trim())) {
    if (n !== '' && n.toLowerCase() !== primary.trim().toLowerCase() && !out.includes(n)) out.push(n);
  }
  return out;
}

export async function create(v: NewPermitInput): Promise<PermitRow> {
  await delay();
  mustHave('permits.manage');
  const s = read();
  const again = s.permits.find((p) => p.request_key === v.key && p.created_by === mockUser().id);
  if (again) return rowOf(again);
  if (!permitJobRows().some((j) => j.id === v.projectId && j.modules.includes('permits'))) throw fail('Permits are off for this job.');
  checkFields(s, v.projectId, v.primaryNumber, v.title, null);
  if (v.assignedTo !== null && v.assignedTo !== OFFICIAL && v.assignedTo !== OFFICIAL_2) {
    throw fail('Pick someone on this job who handles permits.');
  }
  const now = new Date().toISOString();
  const p: StoredPermit = {
    id: `mock-permit-new-${String(s.permits.length + 1)}`, project_id: v.projectId, primary_number: v.primaryNumber.trim(),
    agency_numbers: otherNumbers(v.primaryNumber, v.otherNumbers), title: v.title.trim(), kind: v.kind, stage: v.stage,
    stage_since: now, assigned_to: v.assignedTo, issued_on: null, expires_on: null, extensions: 0, notes: v.notes.trim(),
    created_by: mockUser().id, created_at: now, version: 1, request_key: v.key,
  };
  write((x) => ({
    ...x,
    permits: [...x.permits, p],
    events: [...x.events, { id: x.events.length + 1, permit_id: p.id, stage: p.stage, at: now, actor: mockUser().id, note: null, prior: null, undone: false }],
  }));
  return rowOf(p);
}

function save(next: StoredPermit): PermitRow {
  write((x) => ({ ...x, permits: x.permits.map((p) => (p.id === next.id ? next : p)) }));
  return rowOf(next);
}

export async function update(ref: PermitRef, e: PermitEdit): Promise<PermitRow> {
  await delay();
  const s = read();
  const p = stored(s, ref.id);
  mustHave('permits.manage');
  if (p.version !== ref.version) throw conflictError();
  checkFields(s, p.project_id, e.primaryNumber, e.title, p.id);
  if (e.issuedOn !== null && e.expiresOn !== null && e.expiresOn < e.issuedOn) throw fail("It can't expire before it was issued.");
  return save({
    ...p, primary_number: e.primaryNumber.trim(), agency_numbers: otherNumbers(e.primaryNumber, e.otherNumbers), title: e.title.trim(),
    kind: e.kind, assigned_to: e.assignedTo, issued_on: e.issuedOn, expires_on: e.expiresOn, extensions: e.extensions,
    notes: e.notes.trim(), version: p.version + 1,
  });
}

export async function move(ref: PermitRef, stage: string): Promise<PermitRow> {
  await delay();
  const s = read();
  const p = stored(s, ref.id);
  mustHave('permits.manage');
  if (p.stage === stage) return rowOf(p);
  if (p.version !== ref.version) throw conflictError();
  if (!(NEXT[p.stage] ?? []).includes(stage)) throw fail("It can't go there from here.");
  const now = new Date().toISOString();
  const issued = stage === 'issued' ? (p.issued_on ?? todayInZone(permitJobZone(p.project_id))) : p.issued_on;
  const expires = stage === 'issued' ? (p.expires_on ?? (issued === null ? null : yearOn(issued))) : p.expires_on;
  const prior = { issued_on: p.issued_on, expires_on: p.expires_on };
  write((x) => ({
    ...x,
    events: [...x.events, { id: x.events.length + 1, permit_id: p.id, stage, at: now, actor: mockUser().id, note: null, prior, undone: false }],
  }));
  return save({ ...p, stage, stage_since: now, issued_on: issued, expires_on: expires, version: p.version + 1 });
}

export async function undoMove(ref: PermitRef): Promise<PermitRow> {
  await delay();
  const s = read();
  const p = stored(s, ref.id);
  mustHave('permits.manage');
  if (p.version !== ref.version) throw conflictError();
  const active = s.events.filter((e) => e.permit_id === p.id && !e.undone).sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  const last = active[active.length - 1];
  const prev = active[active.length - 2];
  if (!last || !prev || last.actor !== mockUser().id || last.stage !== p.stage || Date.now() - Date.parse(last.at) > 15 * 60_000) {
    throw fail("That move can't be undone now.");
  }
  write((x) => ({ ...x, events: x.events.map((e) => (e.id === last.id ? { ...e, undone: true } : e)) }));
  return save({
    ...p, stage: prev.stage, stage_since: prev.at, issued_on: last.prior?.issued_on ?? null, expires_on: last.prior?.expires_on ?? null,
    version: p.version + 1,
  });
}
