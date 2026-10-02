// Permit words and pure helpers: the stages in order with OSFM's status codes (so the official recognizes them), kinds,
// review outcomes, the log's filters and order, the tracker's cells, the move buttons' words, the expiry and where the
// approved set lives. The database owns the order and the allowed moves (permit_next_stages); this file only names
// them. Unit-tested in model.test.ts.
import type { PermitListRow, PermitStep } from '../../data/permits.types';
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
  { value: 'inspections', label: 'Inspections', code: null },
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

export const KINDS = [
  { value: 'building', label: 'Building' },
  { value: 'deferred_fire_alarm', label: 'Fire alarm (deferred)' },
  { value: 'deferred_sprinkler', label: 'Fire sprinkler (deferred)' },
  { value: 'deferred_errcs', label: 'Radio coverage (deferred)' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'change_order', label: 'Change order' },
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

const REVIEW_KINDS: Readonly<Record<string, string>> = {
  initial: 'Initial',
  backcheck: 'Backcheck',
  deferred: 'Deferred',
  addendum: 'Addendum',
  change_order: 'Change order',
};

export function reviewKindLabel(kind: string): string {
  return REVIEW_KINDS[kind] ?? kind;
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

const CLOSED = ['complete', 'cancelled'];
const ISSUED = ['issued', 'inspections', 'approved'];

/** Open: everything not complete or cancelled. Issued: issued and building (issued, inspections, approved). */
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

interface Expiry {
  /** "Jun 3, 2027". */
  date: string;
  /** The day has passed on the job's clock. */
  late: boolean;
}

/** When an issued permit expires; nothing before issue or once it is done. */
export function expiry(p: { expires_on: string | null; stage: string }, tz: string, now: Date): Expiry | null {
  if (p.expires_on === null || !ISSUED.includes(p.stage)) return null;
  return { date: formatDay(p.expires_on, 'MMM d, yyyy'), late: p.expires_on < todayInZone(tz, now) };
}

/** The job's folder for the approved set: one named for approved plans or permits. */
export function approvedFolder<T extends { name: string }>(folders: readonly T[]): T | null {
  return folders.find((f) => /approved|permit/i.test(f.name)) ?? null;
}

/** Other numbers typed in one box, split on commas or semicolons. */
export function splitNumbers(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}
