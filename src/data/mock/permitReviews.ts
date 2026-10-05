// e2e mock of permit reviews and comments (0052, 0061), with the database's rules: reviews under one permit, each with
// its kind, its number on the permit and its backchecks (every row one cycle); several reviews open at once, one open
// cycle per review; deferred items only once the permit is issued; comments only on an open cycle and numbered per
// permit, answers by the design team (permits.respond) while open (a replaced answer stays on the comment), close /
// reopen by the official, and naming the permit an inspection request is for (through the inspections mock, so the
// request carries it like the real row).
import { conflictError } from '../errors';
import type { PermitComment, PermitReview } from '../permits.types';
import { todayInZone } from '../../lib/dates';
import { mockUser } from './index';
import * as inspections from './inspections';
import { permitJobZone } from './permitJobs';
import type { PermitMockState, StoredComment, StoredPermit, StoredReview } from './permitSeeds';
import { fail, mustHave, nameOf, read, stored, write } from './permitStore';
import { delay } from './store';

function reviewOf(r: StoredReview): PermitReview {
  return {
    id: r.id, permit_id: r.permit_id, cycle: r.cycle, review_no: r.review_no, backcheck: r.backcheck, kind: r.kind,
    received_on: r.received_on, returned_on: r.returned_on, outcome: r.outcome, version: r.version,
  };
}

function commentOf(c: StoredComment): PermitComment {
  return { ...c, responded_by_name: nameOf(c.responded_by) };
}

function next(s: PermitMockState, counter: string): number {
  return s.counters[counter] ?? 1;
}

/** The kinds a new review takes (permit_review_kind_ok without the unnamed 'deferred' of before 0061). */
const NEW_KINDS = ['initial', 'deferred_fire_alarm', 'deferred_sprinkler', 'deferred_errcs', 'addendum', 'change_order'];
const CLOSED = ['complete', 'cancelled'];
const ISSUED = ['issued', 'inspected', 'approved'];

/** One more cycle on the permit (the next cycle number), with the counter it took its review or backcheck number from. */
function addCycle(p: StoredPermit, of: Pick<StoredReview, 'review_no' | 'backcheck' | 'kind'>, key: string, counter: string, used: number): PermitReview {
  const cycles = `permit_review:${p.id}`;
  const cycle = next(read(), cycles);
  const r: StoredReview = {
    id: `${p.id}-r${String(cycle)}`, permit_id: p.id, cycle, review_no: of.review_no, backcheck: of.backcheck, kind: of.kind,
    received_on: todayInZone(permitJobZone(p.project_id)), returned_on: null, outcome: null, version: 1, created_by: mockUser().id,
    request_key: key,
  };
  write((x) => ({ ...x, reviews: [...x.reviews, r], counters: { ...x.counters, [counter]: used + 1, [cycles]: cycle + 1 } }));
  return reviewOf(r);
}

/** permit_review_open: a new review of a kind, numbered per permit. Several may be open at once. */
export async function reviewOpen(permitId: string, kind: string, key: string): Promise<PermitReview> {
  await delay();
  const s = read();
  const p = stored(s, permitId);
  mustHave('permits.manage');
  const again = s.reviews.find((r) => r.request_key === key && r.created_by === mockUser().id);
  if (again) return reviewOf(again);
  if (CLOSED.includes(p.stage)) throw fail('This permit is closed.');
  if (!NEW_KINDS.includes(kind)) throw fail('Unknown review kind.');
  if (kind.startsWith('deferred_') && !ISSUED.includes(p.stage)) throw fail('Deferred items open once the permit is issued.');
  const counter = `permit_review_no:${p.id}`;
  const reviewNo = next(s, counter);
  return addCycle(p, { review_no: reviewNo, backcheck: 0, kind }, key, counter, reviewNo);
}

/** permit_review_backcheck: the next backcheck of the review this cycle belongs to, once none of its cycles is open. */
export async function reviewBackcheck(reviewId: string, key: string): Promise<PermitReview> {
  await delay();
  const s = read();
  const r = s.reviews.find((x) => x.id === reviewId);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  const p = stored(s, r.permit_id);
  mustHave('permits.manage');
  const again = s.reviews.find((x) => x.request_key === key && x.created_by === mockUser().id && !x.withdrawn_at);
  if (again) return reviewOf(again);
  if (CLOSED.includes(p.stage)) throw fail('This permit is closed.');
  if (s.reviews.some((x) => x.permit_id === p.id && x.review_no === r.review_no && x.outcome === null && !x.withdrawn_at)) {
    throw fail('Close the open review first.');
  }
  // A cycle taken back is this one again (0080: numbers never skip).
  const back = s.reviews.find((x) => x.permit_id === p.id && x.review_no === r.review_no && x.withdrawn_at);
  if (back) {
    const again: StoredReview = {
      ...back, withdrawn_at: null, request_key: key, created_by: mockUser().id,
      received_on: todayInZone(permitJobZone(p.project_id)), version: back.version + 1,
    };
    write((x) => ({ ...x, reviews: x.reviews.map((y) => (y.id === back.id ? again : y)) }));
    return reviewOf(again);
  }
  const counter = `permit_bc:${p.id}:${String(r.review_no)}`;
  const backcheck = next(s, counter);
  return addCycle(p, { review_no: r.review_no, backcheck, kind: r.kind }, key, counter, backcheck);
}

/** permit_review_withdraw (0080): the Undo of a Backcheck, while it is open and has no comments. */
export async function reviewWithdraw(reviewId: string, version: number): Promise<PermitReview> {
  await delay();
  const s = read();
  const r = s.reviews.find((x) => x.id === reviewId);
  if (!r) throw fail('That item no longer exists.', 'P0002');
  stored(s, r.permit_id);
  mustHave('permits.manage');
  if (r.withdrawn_at) return reviewOf(r);
  if (r.version !== version) throw conflictError();
  if (r.backcheck === 0 || r.outcome !== null) throw fail('Only an open backcheck can be taken back.');
  if (s.comments.some((c) => c.review_id === r.id)) throw fail('This backcheck has comments.');
  const gone: StoredReview = { ...r, withdrawn_at: new Date().toISOString(), version: r.version + 1 };
  write((x) => ({ ...x, reviews: x.reviews.map((y) => (y.id === r.id ? gone : y)) }));
  return reviewOf(gone);
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
  // Opening a cycle again (the Undo) waits for its review's open one.
  if (outcome === null && s.reviews.some((x) => x.permit_id === p.id && x.review_no === r.review_no && x.outcome === null)) {
    throw fail('Close the open review first.');
  }
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
  if (r.withdrawn_at) throw fail('This backcheck was taken back.');
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
    // The earlier answer stays on the comment (0054).
    const earlier = c.response === null ? (c.earlier_answers ?? [])
      : [...(c.earlier_answers ?? []), { response: c.response, by_name: nameOf(c.responded_by), at: c.responded_at }];
    return {
      ...c, response: response.trim(), responded_by: mockUser().id, responded_at: new Date().toISOString(),
      earlier_answers: earlier, version: c.version + 1,
    };
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
