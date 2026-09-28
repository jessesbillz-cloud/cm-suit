// The bids pipeline across jobs: which stages show (the funnel toggles), the sort (open bids first, bid due soonest,
// no date last), stage chips (lib/status colors only) and the short "in 3 days" line. Pure, unit-tested.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { PipelineRow } from '../../data/bids.pipeline';
import { formatInZone, todayInZone } from '../../lib/dates';
import { isBidStage, PIPELINE_STAGES, stageLabel } from '../../lib/jobs';
import type { StatusKey } from '../../lib/status';

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// --- Stages: the funnel ------------------------------------------------------------------------------------------

/** The open bids: what the pipeline shows until someone turns other stages on. */
const OPEN_STAGES: readonly PipelineStage[] = PIPELINE_STAGES.filter((s) => isBidStage(s));

function isPipelineStage(v: string): v is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(v);
}

/** "?stages=prospect,awarded" -> the stages shown, in funnel order. Missing or junk = the open ones. */
export function parseStages(v: string | undefined): PipelineStage[] {
  const picked = new Set((v ?? '').split(',').filter(isPipelineStage));
  return picked.size === 0 ? [...OPEN_STAGES] : PIPELINE_STAGES.filter((s) => picked.has(s));
}

/** Back into the URL; the default (the open ones) leaves the URL clean. */
export function stagesParam(stages: readonly PipelineStage[]): string | undefined {
  const same = stages.length === OPEN_STAGES.length && OPEN_STAGES.every((s) => stages.includes(s));
  return same ? undefined : PIPELINE_STAGES.filter((s) => stages.includes(s)).join(',');
}

/** A funnel tap turns a stage on or off. The last one shown stays on, so the list never goes blank by accident. */
export function toggleStage(stages: readonly PipelineStage[], stage: PipelineStage): PipelineStage[] {
  if (!stages.includes(stage)) return PIPELINE_STAGES.filter((s) => s === stage || stages.includes(s));
  return stages.length === 1 ? [...stages] : stages.filter((s) => s !== stage);
}

/** How many jobs sit in each stage (the funnel's numbers). */
export function stageCounts(rows: readonly PipelineRow[]): Record<PipelineStage, number> {
  const counts: Record<PipelineStage, number> = { prospect: 0, bidding: 0, awarded: 0, lost: 0 };
  for (const r of rows) if (isPipelineStage(r.stage)) counts[r.stage] += 1;
  return counts;
}

const STAGE_STATUS: Record<PipelineStage, StatusKey> = {
  prospect: 'pending',
  bidding: 'assigned',
  awarded: 'confirmed',
  lost: 'cancelled',
};

/** A stage's chip: colors from lib/status only. */
export function stageChip(stage: string): { status: StatusKey; label: string } {
  return { status: isPipelineStage(stage) ? STAGE_STATUS[stage] : 'cancelled', label: stageLabel(stage) };
}

// --- Sort ----------------------------------------------------------------------------------------------------------

const SORT_KEYS = ['due', 'job', 'stage', 'packages', 'bids', 'questions'] as const;
export type PipelineSortKey = (typeof SORT_KEYS)[number];
export interface PipelineSort {
  key: PipelineSortKey;
  dir: 'asc' | 'desc';
}
const DEFAULT_SORT: PipelineSort = { key: 'due', dir: 'asc' };

/** A new column starts where it is most useful: least covered first, most bids and questions first. */
const FIRST_DIR: Record<PipelineSortKey, 'asc' | 'desc'> = {
  due: 'asc',
  job: 'asc',
  stage: 'asc',
  packages: 'asc',
  bids: 'desc',
  questions: 'desc',
};

export function parseSort(v: string | undefined): PipelineSort {
  const [key, dir] = (v ?? '').split('.');
  const k = SORT_KEYS.find((x) => x === key);
  return k && (dir === 'asc' || dir === 'desc') ? { key: k, dir } : DEFAULT_SORT;
}

export function sortParam(s: PipelineSort): string | undefined {
  return s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir ? undefined : `${s.key}.${s.dir}`;
}

/** Clicking a header: the same column flips; a new one starts in its most useful direction. */
export function nextSort(current: PipelineSort, key: PipelineSortKey): PipelineSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: FIRST_DIR[key] };
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The share of packages with at least one bid; null when the job has no packages yet. */
export function coverage(r: PipelineRow): number | null {
  return r.packages > 0 ? r.packages_covered / r.packages : null;
}

function value(r: PipelineRow, key: PipelineSortKey): string | number | null {
  switch (key) {
    case 'due':
      return r.bid_due_at === null ? null : Date.parse(r.bid_due_at);
    case 'job':
      return r.name;
    case 'stage':
      return isPipelineStage(r.stage) ? PIPELINE_STAGES.indexOf(r.stage) : PIPELINE_STAGES.length;
    case 'packages':
      return coverage(r);
    case 'bids':
      return r.bids_in;
    case 'questions':
      return r.open_questions;
  }
}

function compareValues(a: string | number | null, b: string | number | null, sign: number): number {
  if (a === b) return 0;
  if (a === null) return 1; // empty always last, either direction
  if (b === null) return -1;
  if (typeof a === 'string' && typeof b === 'string') return sign * COLLATOR.compare(a, b);
  return sign * (Number(a) - Number(b));
}

/**
 * The list order. By bid due (the default), open bids come first, then the soonest; a job with no date goes last.
 * Other columns sort by themselves; ties fall back to the bid due, then the name.
 */
export function sortPipeline(rows: readonly PipelineRow[], sort: PipelineSort): PipelineRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'due') {
      const open = Number(!isBidStage(a.stage)) - Number(!isBidStage(b.stage));
      if (open !== 0) return open;
    }
    return (
      compareValues(value(a, sort.key), value(b, sort.key), sign) ||
      compareValues(value(a, 'due'), value(b, 'due'), 1) ||
      COLLATOR.compare(a.name, b.name)
    );
  });
}

/** The rows in the stages shown, in the picked order. */
export function shownRows(rows: readonly PipelineRow[], stages: readonly PipelineStage[], sort: PipelineSort): PipelineRow[] {
  return sortPipeline(
    rows.filter((r) => isPipelineStage(r.stage) && stages.includes(r.stage)),
    sort,
  );
}

// --- Bid due -------------------------------------------------------------------------------------------------------

/** "Oct 1, 2:00 PM" in the job's zone. */
export function dueDate(dueAt: string, tz: string): string {
  return formatInZone(dueAt, tz, 'MMM d, h:mm a');
}

/** "today", "tomorrow", "in 3 days" (calendar days in the job's zone), or "past" once bid time has gone by. */
export function dueRelative(dueAt: string, tz: string, now: Date = new Date()): string {
  if (Date.parse(dueAt) <= now.getTime()) return 'past';
  const days = differenceInCalendarDays(parseISO(formatInZone(dueAt, tz, 'yyyy-MM-dd')), parseISO(todayInZone(tz, now)));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${String(days)} days`;
}
