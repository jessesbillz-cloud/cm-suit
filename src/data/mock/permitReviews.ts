// e2e mock of permit reviews and comments (0052), with the database's rules: one open review at a time (the first is
// the initial review, later ones backchecks), comments only on the open review and numbered per permit, answers by
// the design team (permits.respond) while open, close / reopen by the official (the latest cycle), and naming the
// permit an inspection request is for (through the inspections mock, so the request carries it like the real row).
import { conflictError } from '../errors';
import type { PermitComment, PermitReview } from '../permits.types';
import { todayInZone } from '../../lib/dates';
import { mockUser } from './index';
import * as inspections from './inspections';
import { permitJobZone } from './permitJobs';
import type { PermitMockState, StoredComment, StoredReview } from './permitSeeds';
import { fail, mustHave, nameOf, read, stored, write } from './permitStore';
import { delay } from './store';

function reviewOf(r: StoredReview): PermitReview {
  return { id: r.id, permit_id: r.permit_id, cycle: r.cycle, kind: r.kind, received_on: r.received_on, returned_on: r.returned_on, outcome: r.outcome, version: r.version };
}

function commentOf(c: StoredComment): PermitComment {
  return { ...c, responded_by_name: nameOf(c.responded_by) };
}

function next(s: PermitMockState, counter: string): number {
  return s.counters[counter] ?? 1;
}

export async function reviewOpen(permitId: string, key: string): Promise<PermitReview> {
  await delay();
  const s = read();
  const p = stored(s, permitId);
  mustHave('permits.manage');
  const again = s.reviews.find((r) => r.request_key === key && r.created_by === mockUser().id);
  if (again) return reviewOf(again);
  if (p.stage === 'complete' || p.stage === 'cancelled') throw fail('This permit is closed.');
  if (s.reviews.some((r) => r.permit_id === p.id && r.outcome === null)) throw fail('Close the open review first.');
  const counter = `permit_review:${p.id}`;
  const cycle = next(s, counter);
  const r: StoredReview = {
    id: `${p.id}-r${String(cycle)}`, permit_id: p.id, cycle, kind: cycle === 1 ? 'initial' : 'backcheck',
    received_on: todayInZone(permitJobZone(p.project_id)), returned_on: null, outcome: null, version: 1, created_by: mockUser().id,
    request_key: key,
  };
  write((x) => ({ ...x, reviews: [...x.reviews, r], counters: { ...x.counters, [counter]: cycle + 1 } }));
  return reviewOf(r);
}

export async function reviewClose(reviewId: string, version: number, outcome: string | null): Promise<PermitReview> {
  await delay();
  const s = read();
  const r = s.reviews.find((x) => x.id === reviewId);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  const p = stored(s, r.permit_id);
  mustHave('permits.manage');
  if (r.outcome === outcome) return reviewOf(r);
  if (r.version !== version) throw conflictError();
  if (outcome === null && s.reviews.some((x) => x.permit_id === p.id && x.outcome === null)) throw fail('Close the open review first.');
  const nextRow: StoredReview = {
    ...r, outcome, returned_on: outcome === null ? null : todayInZone(permitJobZone(p.project_id)), version: r.version + 1,
  };
  write((x) => ({ ...x, reviews: x.reviews.map((y) => (y.id === r.id ? nextRow : y)) }));
  return reviewOf(nextRow);
}

interface NewComment {
  reviewId: string;
  body: string;
  sheet: string;
  detail: string;
  codeRef: string;
  key: string;
}

export async function commentAdd(v: NewComment): Promise<PermitComment> {
  await delay();
  const s = read();
  const r = s.reviews.find((x) => x.id === v.reviewId);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  const p = stored(s, r.permit_id);
  mustHave('permits.manage');
  const again = s.comments.find((c) => c.request_key === v.key && c.created_by === mockUser().id);
  if (again) return commentOf(again);
  if (r.outcome !== null) throw fail('This review is closed.');
  if (v.body.trim() === '') throw fail('Add the comment.');
  const counter = `permit_comment:${p.id}`;
  const number = next(s, counter);
  const c: StoredComment = {
    id: `${p.id}-c${String(number)}`, permit_id: p.id, review_id: r.id, number, sheet: v.sheet.trim(), detail: v.detail.trim(),
    code_ref: v.codeRef.trim(), body: v.body.trim(), response: null, responded_by: null, responded_at: null, status: 'open',
    closed_cycle: null, version: 1, created_by: mockUser().id, created_at: new Date().toISOString(), request_key: v.key,
  };
  write((x) => ({ ...x, comments: [...x.comments, c], counters: { ...x.counters, [counter]: number + 1 } }));
  return commentOf(c);
}

function changeComment(id: string, version: number, change: (c: StoredComment, s: PermitMockState) => StoredComment | null): PermitComment {
  const s = read();
  const c = s.comments.find((x) => x.id === id);
  if (!c) throw fail('That item no longer exists.', 'P0002');
  stored(s, c.permit_id);
  const nextRow = change(c, s);
  if (nextRow === null) return commentOf(c);
  if (c.version !== version) throw conflictError();
  write((x) => ({ ...x, comments: x.comments.map((y) => (y.id === c.id ? nextRow : y)) }));
  return commentOf(nextRow);
}

export async function commentRespond(id: string, version: number, response: string): Promise<PermitComment> {
  await delay();
  mustHave('permits.respond');
  return changeComment(id, version, (c) => {
    if (c.response === response.trim()) return null;
    if (c.status !== 'open') throw fail('This comment is closed.');
    if (response.trim() === '') throw fail('Add the answer.');
    return { ...c, response: response.trim(), responded_by: mockUser().id, responded_at: new Date().toISOString(), version: c.version + 1 };
  });
}

export async function commentClose(id: string, version: number, closed: boolean): Promise<PermitComment> {
  await delay();
  mustHave('permits.manage');
  return changeComment(id, version, (c, s) => {
    if ((c.status === 'closed') === closed) return null;
    const cycle = Math.max(0, ...s.reviews.filter((r) => r.permit_id === c.permit_id).map((r) => r.cycle));
    return { ...c, status: closed ? 'closed' : 'open', closed_cycle: closed ? cycle : null, version: c.version + 1 };
  });
}

export async function setRequestPermit(requestId: string, version: number, permitId: string | null): Promise<void> {
  if (permitId !== null) stored(read(), permitId);
  mustHave('permits.manage');
  await inspections.rpc('set_request_permit', { p_request_id: requestId, p_version: version, p_permit_id: permitId });
}
