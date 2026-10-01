// Synthetic RFIs on Sample Job A for the e2e mock and the preview: one of each state the log and the board show
// (closed, answered with an impact claim, late, not opened, waiting to issue, in review, a draft). Times are relative
// to when the mock first loads, so "late" and "not opened" always hold. Obviously fake (CLAUDE.md rule 8).
import type { RfiEventKind, RfiRow } from '../rfis.types';
import { SEED_RFI_ID } from './boardSeeds';

const JOB = 'job-a';
const SUB = 'mock-user-sub';
const PM = 'mock-user-pm';
const INSPECTOR = 'mock-user-inspector';
const ARCHITECT = 'mock-user-architect';
const DAY = 86_400_000;

export interface StoredRfi extends RfiRow {
  key: string | null;
}

export interface StoredStep {
  position: number;
  role: string | null;
  user_id: string | null;
  label: string;
}

interface StoredEvent {
  rfi_id: string;
  at: string;
  actor: string;
  kind: RfiEventKind;
  step: number | null;
  note: string | null;
}

export interface JobRfiSettings {
  answer_days: number;
  impact_days: number;
  version: number;
  route: StoredStep[];
}

export interface RfiMockState {
  rfis: StoredRfi[];
  steps: Record<string, StoredStep[]>;
  events: StoredEvent[];
  settings: Record<string, JobRfiSettings>;
  next: Record<string, number>;
}

/** What a job without a settings row gets (the database's defaults). */
export const DEFAULT_SETTINGS: JobRfiSettings = { answer_days: 7, impact_days: 7, version: 0, route: [] };

const INSPECTOR_STEP: StoredStep = { position: 1, role: 'inspector', user_id: null, label: 'Inspector' };

function blank(now: number, id: string, title: string, by: string, ago: number): StoredRfi {
  return {
    id, org_id: 'org-sample', project_id: JOB, number: null, status: 'draft', title, question: '', suggestion: '', refs: '',
    photo_ids: [], cost_impact: null, time_impact: null, needed_by: null, step: 0, due_at: null,
    held_since: iso(now - ago * DAY), held_opened_at: iso(now - ago * DAY), sent_at: null, issued_at: null, answer: null,
    answer_file_ids: [], answered_at: null, impact_until: null, impact_claimed_at: null, impact_cost: null, impact_time: null,
    impact_note: null, impact_gc_note: null, closed_at: null, void_note: null, pdf_file_id: null, created_by: by,
    created_at: iso(now - ago * DAY), version: 1, key: null,
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function ev(rfi: string, at: number, actor: string, kind: RfiEventKind, step: number | null = null, note: string | null = null): StoredEvent {
  return { rfi_id: rfi, at: iso(at), actor, kind, step, note };
}

/** Sent, reviewed by the inspector, issued: the shared start of every issued seed. */
function issuedTrail(id: string, by: string, now: number, sent: number, issued: number): StoredEvent[] {
  return [
    ev(id, now - (sent + 0.1) * DAY, by, 'created'),
    ev(id, now - sent * DAY, by, 'sent'),
    ev(id, now - (sent - 0.4) * DAY, INSPECTOR, 'forwarded', 1),
    ev(id, now - issued * DAY, PM, 'issued'),
  ];
}

export function seedState(now: number): RfiMockState {
  const closed: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-1', 'Sample paint color for exterior soffits', SUB, 21),
    number: 1, status: 'closed', question: 'Sample question: the finish schedule lists two colors for the soffits. Which one applies?',
    sent_at: iso(now - 20 * DAY), issued_at: iso(now - 19 * DAY), due_at: iso(now - 12 * DAY), answer: 'Sample answer: use color P-2.',
    answered_at: iso(now - 15 * DAY), impact_until: iso(now - 8 * DAY), closed_at: iso(now - 14 * DAY), held_since: iso(now - 14 * DAY), version: 6,
  };
  const claimed: StoredRfi = {
    ...blank(now, SEED_RFI_ID, 'Sample storefront head anchor spacing at grid C', SUB, 13),
    number: 2, status: 'answered', question: 'Sample question: the storefront head detail shows anchors at 16 in. on center, the shop drawing at 24 in. Which governs?',
    suggestion: 'Sample: keep 24 in. with a heavier clip.', refs: 'Sample A-501 detail 4', cost_impact: true, time_impact: true,
    needed_by: iso(now - 5 * DAY).slice(0, 10), sent_at: iso(now - 12 * DAY), issued_at: iso(now - 11 * DAY), due_at: iso(now - 4 * DAY),
    answer: 'Sample answer: anchors at 16 in. on center as detailed. See the attached sheet.', answer_file_ids: ['job-a-file-1'],
    answered_at: iso(now - 3 * DAY), impact_until: iso(now + 4 * DAY), impact_claimed_at: iso(now - 2 * DAY), impact_cost: true,
    impact_time: true, impact_note: 'Sample: framing is already in at 24 in.; re-anchoring adds two days.', held_since: iso(now - 3 * DAY),
    held_opened_at: iso(now - 3 * DAY), version: 7,
  };
  const late: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-3', 'Sample storm drain connection at interim housing — invert conflicts with existing 8-inch line at grid C', PM, 11),
    number: 3, status: 'open', question: 'Sample question: the new storm drain invert at grid C is 4 in. below the existing 8-inch line. Can the connection drop?',
    sent_at: iso(now - 10 * DAY), issued_at: iso(now - 9 * DAY), due_at: iso(now - 2 * DAY), held_since: iso(now - 9 * DAY),
    held_opened_at: iso(now - 8 * DAY), version: 4,
  };
  const unopened: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-4', 'Sample door hardware set at stair 2', SUB, 7),
    number: 4, status: 'open', question: 'Sample question: hardware set 12 lists a closer the frame cannot take. Which set applies?',
    sent_at: iso(now - 6 * DAY), issued_at: iso(now - 5 * DAY), due_at: iso(now + 2 * DAY), held_since: iso(now - 5 * DAY),
    held_opened_at: null, version: 4,
  };
  const toIssue: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-5', 'Sample fire damper access panel location', SUB, 4),
    status: 'issue', question: 'Sample question: the access panel for the fire damper lands in a rated ceiling. Where should it go?',
    sent_at: iso(now - 3 * DAY), held_since: iso(now - 2 * DAY), held_opened_at: null, version: 3,
  };
  const review: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-6', 'Sample slab edge detail at east canopy', PM, 1.2),
    status: 'review', step: 1, question: 'Sample question: the slab edge at the east canopy has no embed shown. Is one required?',
    sent_at: iso(now - DAY), held_since: iso(now - DAY), held_opened_at: null, version: 2,
  };
  const draft: StoredRfi = {
    ...blank(now, 'mock-rfi-job-a-7', 'Sample ceiling height at lobby', PM, 0.1),
    question: 'Sample question: the reflected ceiling plan and the section disagree on the lobby ceiling height.',
  };
  const steps = Object.fromEntries([claimed, late, unopened, toIssue, review, closed].map((r) => [r.id, [INSPECTOR_STEP]]));
  return {
    rfis: [closed, claimed, late, unopened, toIssue, review, draft],
    steps,
    events: [
      ...issuedTrail(closed.id, SUB, now, 20, 19),
      ev(closed.id, now - 15 * DAY, ARCHITECT, 'answered'),
      ev(closed.id, now - 14 * DAY, SUB, 'closed'),
      ...issuedTrail(claimed.id, SUB, now, 12, 11),
      ev(claimed.id, now - 3 * DAY, ARCHITECT, 'answered'),
      ev(claimed.id, now - 2 * DAY, SUB, 'impact_claimed', null, claimed.impact_note),
      ...issuedTrail(late.id, PM, now, 10, 9),
      ev(late.id, now - 8 * DAY, ARCHITECT, 'opened'),
      ...issuedTrail(unopened.id, SUB, now, 6, 5),
      ev(toIssue.id, now - 4 * DAY, SUB, 'created'),
      ev(toIssue.id, now - 3 * DAY, SUB, 'sent'),
      ev(toIssue.id, now - 2 * DAY, INSPECTOR, 'forwarded', 1),
      ev(review.id, now - 1.2 * DAY, PM, 'created'),
      ev(review.id, now - DAY, PM, 'sent'),
      ev(draft.id, now - 0.1 * DAY, PM, 'created'),
    ],
    settings: { [JOB]: { answer_days: 7, impact_days: 7, version: 1, route: [INSPECTOR_STEP] } },
    next: { [JOB]: 5 },
  };
}
