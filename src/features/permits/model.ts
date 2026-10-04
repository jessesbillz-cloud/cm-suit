// Permit words and pure helpers: the stages in order with OSFM's status codes (so the official recognizes them), kinds,
// reviews (their kinds, "review 2 BC 1", what "New review" offers, when "Backcheck" shows), review outcomes, the log's
// filters and order, the tracker's cells, the move buttons' words, what holds Inspected and the expiry. The database
// owns the order and the allowed moves (permit_next_stages), the review rules and the expiry day; this file only names
// them. Unit-tested in model.test.ts.
import type { PermitListRow, PermitReview, PermitStep } from '../../data/permits.types';
import { formatDay, formatInZone, todayInZone } from '../../lib/dates';
import type { StepperState } from '../../ui/Stepper';
import { daysLabel } from '../rfis/progress';

/** The right column's "new permit" item (permits are uuids). */
export const NEW_ITEM = 'new';

interface Stage {
  value: string;
  label: string;
  /** OSFM's two-letter status (GOVmotus), where it has one. */
  code: string | null;
}

const STAGES: readonly Stage[] = [
  { value: 'draft', label: 'Draft', code: 'DR' },
  { value: 'submitted', label: 'Submitted', code: 'NW' },
  { value: 'accepted', label: 'Accepted', code: 'AC' },
  { value: 'rejected', label: 'Rejected', code: 'RJ' },
  { value: 'in_review', label: 'In review', code: 'ER' },
  { value: 'comments_out', label: 'Comments out', code: 'PR' },
  { value: 'backcheck', label: 'Backcheck', code: null },
  { value: 'issued', label: 'Issued', code: 'PI' },
  { value: 'inspected', label: 'Inspected', code: 'IS' },
  { value: 'approved', label: 'Approved', code: 'AP' },
  { value: 'complete', label: 'Complete', code: 'CO' },
  { value: 'cancelled', label: 'Cancelled', code: 'CN' },
];

export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function stageCode(stage: string): string | null {
  return STAGES.find((s) => s.value === stage)?.code ?? null;
}

/** Where a new permit may start (a permit already in progress is typed in at its stage). */
export const START_STAGES = STAGES.filter((s) => s.value !== 'rejected' && s.value !== 'cancelled').map((s) => ({
  value: s.value,
  label: s.label,
}));

/** permit_kind_ok. Deferred items, addenda and change orders are reviews under a permit (REVIEW_KINDS). */
export const KINDS = [
  { value: 'building', label: 'Building' },
  { value: 'structure', label: 'Structure' },
  { value: 'site_utility', label: 'Site / utility' },
  { value: 'other', label: 'Other' },
] as const;

export function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export const OUTCOMES = [
  { value: 'approved', label: 'Approved' },
  { value: 'approved_as_noted', label: 'Approved as noted' },
  { value: 'revise_resubmit', label: 'Revise and resubmit' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export function outcomeLabel(outcome: string): string {
  return OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
}

interface Option {
  value: string;
  label: string;
}

/** permit_review_kind_ok, in the order "New review" lists them. */
const REVIEW_KINDS: readonly Option[] = [
  { value: 'initial', label: 'Initial' },
  { value: 'deferred_fire_alarm', label: 'Fire alarm (deferred)' },
  { value: 'deferred_sprinkler', label: 'Fire sprinkler (deferred)' },
  { value: 'deferred_errcs', label: 'Radio coverage (deferred)' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'change_order', label: 'Change order' },
  // Before 0061, no system named: still read, never offered.
  { value: 'deferred', label: 'Deferred' },
];

export function reviewKindLabel(kind: string): string {
  return REVIEW_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** permit_review_label's words: "review 2", "review 2 BC 1". */
export function reviewLabel(reviewNo: number, backcheck: number): string {
  return `review ${String(reviewNo)}${backcheck > 0 ? ` BC ${String(backcheck)}` : ''}`;
}

/** The same at the start of a line: "Review 2 BC 1". */
export function reviewTitle(reviewNo: number, backcheck: number): string {
  return `R${reviewLabel(reviewNo, backcheck).slice(1)}`;
}

const CLOSED = ['complete', 'cancelled'];
/** Issued and building: where deferred items open (permit_review_open) and the expiry shows. */
const ISSUED = ['issued', 'inspected', 'approved'];

/**
 * What "New review" asks. Nothing (empty) on a permit not yet issued with no review: that one is the initial review.
 * Otherwise the kind: the initial review only while there is none, deferred items once the permit is issued (the
 * database's rule), an addendum, a change order.
 */
export function newReviewKinds(stage: string, reviews: number): Option[] {
  const issued = ISSUED.includes(stage);
  if (reviews === 0 && !issued) return [];
  return REVIEW_KINDS.filter(
    (k) => k.value !== 'deferred' && (k.value !== 'initial' || reviews === 0) && (issued || !k.value.startsWith('deferred_')),
  );
}

type ReviewCycle = Pick<PermitReview, 'review_no' | 'backcheck' | 'outcome'>;

/** Outcomes that send it back to be resubmitted. */
const RESUBMIT = ['revise_resubmit', 'rejected'];

/**
 * "Backcheck" on a cycle: it came back to be resubmitted, it is its review's latest cycle and none of that review's
 * cycles is open (the database keeps one open cycle per review).
 */
export function backcheckOffered(cycle: ReviewCycle, all: readonly ReviewCycle[]): boolean {
  if (cycle.outcome === null || !RESUBMIT.includes(cycle.outcome)) return false;
  return all.every((r) => r.review_no !== cycle.review_no || (r.outcome !== null && r.backcheck <= cycle.backcheck));
}

export const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'issued', label: 'Issued' },
  { value: 'all', label: 'All' },
] as const;
export type Filter = (typeof FILTERS)[number]['value'];

export function parseFilter(v: string | undefined): Filter {
  return FILTERS.find((f) => f.value === v)?.value ?? 'open';
}

/** Open: everything not complete or cancelled. Issued: issued and building (issued, inspected, approved). */
export function inFilter(stage: string, filter: Filter): boolean {
  if (filter === 'open') return !CLOSED.includes(stage);
  if (filter === 'issued') return ISSUED.includes(stage);
  return true;
}

/** By permit number (numbers inside compare as numbers), then job. */
export function byNumber(a: PermitListRow, b: PermitListRow): number {
  return (
    a.primary_number.localeCompare(b.primary_number, 'en', { numeric: true, sensitivity: 'base' }) ||
    a.project_name.localeCompare(b.project_name)
  );
}

/** "6 open · 2 issued": the log's one line. */
export function logSummary(rows: readonly Pick<PermitListRow, 'stage'>[]): string {
  const open = rows.filter((r) => inFilter(r.stage, 'open')).length;
  const issued = rows.filter((r) => inFilter(r.stage, 'issued')).length;
  return `${String(open)} open · ${String(issued)} issued`;
}

/** Each permit's places, in order. */
export function stepsByPermit(rows: readonly PermitStep[]): Map<string, PermitStep[]> {
  const by = new Map<string, PermitStep[]>();
  for (const r of rows) by.set(r.permit_id, [...(by.get(r.permit_id) ?? []), r]);
  for (const steps of by.values()) steps.sort((a, b) => a.position - b.position);
  return by;
}

const STATE: Record<PermitStep['state'], StepperState> = { done: 'done', current: 'current', next: 'todo', failed: 'failed' };

interface StepCell {
  key: string;
  kind: string;
  label: string;
  sub: string;
  state: StepperState;
  title: string;
}

/** Hover words: when it got there and when it left, on the job's calendar. */
function cellTitle(step: PermitStep, tz: string): string {
  const label = stageLabel(step.stage);
  if (step.entered_at === null) return label;
  const from = formatInZone(step.entered_at, tz, 'MMM d');
  return step.left_at === null ? `${label} · since ${from}` : `${label} · ${from} to ${formatInZone(step.left_at, tz, 'MMM d')}`;
}

/** A place as a Stepper cell: its stage's name (left out when `labels` is off) and the days it sat there. */
export function stepCell(step: PermitStep, tz: string, labels: boolean): StepCell {
  return {
    key: String(step.position),
    kind: step.stage,
    label: labels ? stageLabel(step.stage) : '',
    sub: daysLabel(step.days),
    state: STATE[step.state],
    title: cellTitle(step, tz),
  };
}

/** The tracker split over two rows of five for a narrow column (the right column, a phone): the names fit. */
export const ROW_PLACES = 5;

/** The words on a move button. */
export function moveLabel(to: string): string {
  if (to === 'rejected') return 'Reject';
  if (to === 'cancelled') return 'Cancel permit';
  return `Move to ${stageLabel(to)}`;
}

/** What a move's Undo toast says. */
export function movedLabel(to: string): string {
  return to === 'cancelled' ? 'Permit cancelled.' : `Moved to ${stageLabel(to)}.`;
}

/**
 * Why Inspected waits, in a few words ("6 inspections open"): the database offers the move from Issued and refuses it
 * while a required inspection is open. Null when nothing holds it.
 */
export function inspectedHold(moves: readonly string[], openInspections: number): string | null {
  if (openInspections <= 0 || !moves.includes('inspected')) return null;
  return `${String(openInspections)} ${openInspections === 1 ? 'inspection' : 'inspections'} open`;
}

interface Expiry {
  /** "Jun 3, 2027". */
  date: string;
  /** The day has passed on the job's clock. */
  late: boolean;
}

/** When an issued permit expires (the database's day: it moves with each inspection); nothing before issue or once it is done. */
export function expiry(p: { expires_on: string | null; stage: string }, tz: string, now: Date): Expiry | null {
  if (p.expires_on === null || !ISSUED.includes(p.stage)) return null;
  return { date: formatDay(p.expires_on, 'MMM d, yyyy'), late: p.expires_on < todayInZone(tz, now) };
}

/** Other numbers typed in one box, split on commas or semicolons. */
export function splitNumbers(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}
