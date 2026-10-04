// Synthetic permits for the e2e mock and the preview (CLAUDE.md rule 8: obviously fake numbers, titles and comments),
// placed relative to now so the tracker's days look real. Deferred items, addenda and change orders are reviews under
// a permit (0061), never permits. On Sample Science Building: the building permit, issued (two inspections linked, one
// still waiting), with four reviews: the initial one and its backcheck, the deferred fire sprinklers back for a second
// backcheck (comments, some answered), the deferred fire alarm and an addendum both open; a parking structure back out
// with comments after its backcheck; a second building in its first review; a site / utility permit just submitted and
// an old one complete; a draft of another kind. On Sample Library Annex (the official's other job): the building permit
// just issued and a structure accepted.
import { addMonths, format, parseISO } from 'date-fns';
import { todayInZone } from '../../lib/dates';
import type { EarlierAnswer } from '../permits.types';

export const OFFICIAL = 'mock-user-ahj';
export const OFFICIAL_2 = 'mock-ahj-2';
/** The permit the seeded inspections on Sample Science Building are linked to. */
export const SEED_PERMIT_S1 = 'mock-permit-s1';

const TZ = 'America/Los_Angeles';
const DAY = 86_400_000;

export interface StoredPermit {
  id: string;
  project_id: string;
  primary_number: string;
  agency_numbers: string[];
  title: string;
  kind: string;
  stage: string;
  stage_since: string;
  assigned_to: string | null;
  issued_on: string | null;
  expires_on: string | null;
  extensions: number;
  notes: string;
  created_by: string;
  created_at: string;
  version: number;
  request_key: string | null;
}

export interface StoredEvent {
  id: number;
  permit_id: string;
  stage: string;
  at: string;
  actor: string | null;
  note: string | null;
  /** The issue dates before this move (null for the first). */
  prior: { issued_on: string | null; expires_on: string | null } | null;
  undone: boolean;
}

export interface StoredReview {
  id: string;
  permit_id: string;
  /** 1, 2, ... across the permit. */
  cycle: number;
  /** The review's number on its permit, and its backcheck (0 = the submittal). */
  review_no: number;
  backcheck: number;
  kind: string;
  received_on: string;
  returned_on: string | null;
  outcome: string | null;
  version: number;
  created_by: string;
  request_key: string | null;
}

export interface StoredComment {
  id: string;
  permit_id: string;
  review_id: string;
  number: number;
  sheet: string;
  detail: string;
  code_ref: string;
  body: string;
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  /** Answers a later one replaced (0054). */
  earlier_answers?: EarlierAnswer[];
  status: 'open' | 'closed';
  closed_cycle: number | null;
  version: number;
  created_by: string;
  created_at: string;
  request_key: string | null;
}

export interface PermitMockState {
  permits: StoredPermit[];
  events: StoredEvent[];
  reviews: StoredReview[];
  comments: StoredComment[];
  /**
   * next_number's counters: 'permit_review:<id>' (cycles), 'permit_review_no:<id>' (reviews),
   * 'permit_bc:<id>:<review>' (a review's backchecks) and 'permit_comment:<id>'.
   */
  counters: Record<string, number>;
}

/** Days ago (negative = ahead), at a fixed hour of that day in UTC, as an ISO instant. */
function at(now: number, daysAgo: number, hour = 17): string {
  const d = new Date(now - daysAgo * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function day(now: number, daysAgo: number): string {
  return todayInZone(TZ, new Date(now - daysAgo * DAY));
}

export function yearOn(issued: string): string {
  return format(addMonths(parseISO(issued), 12), 'yyyy-MM-dd');
}

type PermitSeed = [id: string, job: string, number: string, title: string, kind: string, stages: [string, number][], who: string];

const PERMITS: PermitSeed[] = [
  ['mock-permit-s1', 'job-s', '24-0001', 'Building - new construction', 'building',
    [['draft', 230], ['submitted', 225], ['accepted', 221], ['in_review', 214], ['comments_out', 186], ['backcheck', 172],
      ['in_review', 170], ['issued', 150]], OFFICIAL],
  ['mock-permit-s2', 'job-s', '24-0002', 'Parking structure', 'structure',
    [['draft', 60], ['submitted', 55], ['accepted', 50], ['in_review', 40], ['comments_out', 25], ['backcheck', 15],
      ['in_review', 14], ['comments_out', 6]], OFFICIAL],
  ['mock-permit-s3', 'job-s', '24-0003', 'Building - greenhouse and headhouse', 'building',
    [['draft', 12], ['submitted', 10], ['accepted', 7], ['in_review', 4]], OFFICIAL],
  ['mock-permit-s4', 'job-s', '25-0014', 'Fire water loop extension', 'site_utility',
    [['draft', 5], ['submitted', 2]], OFFICIAL],
  ['mock-permit-s5', 'job-s', '23-0410', 'Site utilities and underground fire service', 'site_utility',
    [['issued', 400], ['inspected', 335], ['approved', 330], ['complete', 320]], OFFICIAL],
  ['mock-permit-s6', 'job-s', '25-0021', 'Temporary tent - commencement', 'other', [['draft', 1]], OFFICIAL],
  ['mock-permit-t1', 'job-t', '25-0102', 'Building - library annex addition', 'building',
    [['draft', 90], ['submitted', 85], ['accepted', 80], ['in_review', 70], ['issued', 10]], OFFICIAL],
  ['mock-permit-t2', 'job-t', '25-0103', 'Covered walkway and book drop', 'structure',
    [['draft', 8], ['submitted', 6], ['accepted', 3]], OFFICIAL_2],
];

type ReviewSeed = [
  permit: string, cycle: number, reviewNo: number, backcheck: number, kind: string, received: number, returned: number | null,
  outcome: string | null,
];

const REVIEWS: ReviewSeed[] = [
  ['mock-permit-s1', 1, 1, 0, 'initial', 214, 186, 'revise_resubmit'],
  ['mock-permit-s1', 2, 1, 1, 'initial', 172, 150, 'approved'],
  ['mock-permit-s1', 3, 2, 0, 'deferred_sprinkler', 40, 25, 'revise_resubmit'],
  ['mock-permit-s1', 4, 2, 1, 'deferred_sprinkler', 15, 6, 'revise_resubmit'],
  ['mock-permit-s1', 5, 3, 0, 'deferred_fire_alarm', 4, null, null],
  ['mock-permit-s1', 6, 4, 0, 'addendum', 1, null, null],
  ['mock-permit-s2', 1, 1, 0, 'initial', 40, 25, 'revise_resubmit'],
  ['mock-permit-s2', 2, 1, 1, 'initial', 15, 6, 'revise_resubmit'],
  ['mock-permit-s3', 1, 1, 0, 'initial', 4, null, null],
  ['mock-permit-t1', 1, 1, 0, 'initial', 70, 10, 'approved_as_noted'],
];

type CommentSeed = [permit: string, cycle: number, sheet: string, detail: string, code: string, body: string, response: string | null, closedIn: number | null];

const COMMENTS: CommentSeed[] = [
  ['mock-permit-s1', 1, 'A0.10', '', 'CBC 1004.5', 'Show the occupant load for the level 2 teaching labs.', 'Occupant loads added to A0.10.', 2],
  ['mock-permit-s1', 1, 'A2.01', '4', 'CBC 716.2.2', 'Rate the stair doors to match the shaft walls.', 'Door schedule revised, A8.10.', 2],
  ['mock-permit-s1', 3, 'FP-1', '', 'NFPA 13 8.15', 'Show the sprinkler riser room and its 1-hour rating.', 'Riser room added on FP-1 with the rated walls clouded.', 4],
  ['mock-permit-s1', 3, 'FP-2', '3', 'CFC 903.3.1.1', 'Provide sprinklers under the exterior canopy wider than 4 ft.', 'Dry pendents added under the canopy, FP-2 detail 3.', 4],
  ['mock-permit-s1', 3, 'FP-3', '', 'NFPA 13 17.4', 'Hanger spacing at the lab mains exceeds the table.', 'Spacing revised on FP-3, cloud 2.', null],
  ['mock-permit-s1', 4, 'FP-3', '5', 'NFPA 13 18.5', 'Seismic bracing at the main risers is not shown.', null, null],
  ['mock-permit-s1', 4, 'FP-4', '', 'CFC 912.2', 'Locate the fire department connection within 100 ft of a hydrant.', null, null],
  ['mock-permit-s2', 1, 'A1.01', '', 'CBC 406.4.2', 'Show the vehicle barriers at the open edges of level 2.', 'Barriers added on A1.01, detailed on A5.02.', 2],
  ['mock-permit-s2', 1, 'A2.01', '2', 'CBC 1006.3', 'Show the second exit stair from the upper deck.', 'Stair 2 added at grid F, A2.01.', null],
  ['mock-permit-s2', 2, 'FP-1', '', 'NFPA 14 7.3', 'Show a standpipe hose connection at each stair landing.', null, null],
];

export function seedState(now: number): PermitMockState {
  const s: PermitMockState = { permits: [], events: [], reviews: [], comments: [], counters: {} };
  for (const [id, job, number, title, kind, stages, who] of PERMITS) {
    const issued = stages.find(([st]) => st === 'issued');
    const issuedOn = issued ? day(now, issued[1]) : null;
    const last = stages[stages.length - 1] ?? ['draft', 0];
    s.permits.push({
      id, project_id: job, primary_number: number, agency_numbers: [], title, kind, stage: last[0], stage_since: at(now, last[1]),
      assigned_to: who, issued_on: issuedOn, expires_on: issuedOn ? yearOn(issuedOn) : null, extensions: 0, notes: '',
      created_by: OFFICIAL, created_at: at(now, stages[0]?.[1] ?? 0), version: stages.length, request_key: null,
    });
    for (const [stage, ago] of stages) {
      s.events.push({ id: s.events.length + 1, permit_id: id, stage, at: at(now, ago), actor: OFFICIAL, note: null, prior: null, undone: false });
    }
  }
  for (const [permit, cycle, reviewNo, backcheck, kind, received, returned, outcome] of REVIEWS) {
    s.reviews.push({
      id: `${permit}-r${String(cycle)}`, permit_id: permit, cycle, review_no: reviewNo, backcheck, kind,
      received_on: day(now, received), returned_on: returned === null ? null : day(now, returned), outcome,
      version: outcome === null ? 1 : 2, created_by: OFFICIAL, request_key: null,
    });
    // In cycle order, so the last of each is the highest.
    s.counters[`permit_review:${permit}`] = cycle + 1;
    s.counters[`permit_review_no:${permit}`] = reviewNo + 1;
    s.counters[`permit_bc:${permit}:${String(reviewNo)}`] = backcheck + 1;
  }
  COMMENTS.forEach(([permit, cycle, sheet, detail, code, body, response, closedIn]) => {
    const n = s.counters[`permit_comment:${permit}`] ?? 1;
    s.counters[`permit_comment:${permit}`] = n + 1;
    s.comments.push({
      id: `${permit}-c${String(n)}`, permit_id: permit, review_id: `${permit}-r${String(cycle)}`, number: n, sheet, detail,
      code_ref: code, body, response, responded_by: response === null ? null : 'mock-user-architect',
      responded_at: response === null ? null : at(now, 18), status: closedIn === null ? 'open' : 'closed', closed_cycle: closedIn,
      version: 1 + (response === null ? 0 : 1) + (closedIn === null ? 0 : 1), created_by: OFFICIAL, created_at: at(now, 25),
      request_key: null,
    });
  });
  return s;
}
