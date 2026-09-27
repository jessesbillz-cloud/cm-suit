// Leveling helpers (SPEC §11.6): which rows stand, which bid is low, the spread, the per-package summary and the
// flag chips. Pure functions over the board and flags rows; unit-tested. Colors come from lib/status only.
import type { FlagRow, LevelingRow, LevelingState, PackageRow } from '../../data/bids.types';
import { humanize } from '../../lib/format';
import type { StatusKey } from '../../lib/status';

interface Chip {
  status: StatusKey;
  label: string;
}

/** Rows that stand (current, or set aside as not comparable) go in the grid; the rest sit below it, greyed. */
export function splitRows(rows: readonly LevelingRow[]): { main: LevelingRow[]; below: LevelingRow[] } {
  const main = rows.filter((r) => r.state === 'current' || r.state === 'not_comparable').sort(byAmountThenBidder);
  const below = rows.filter((r) => r.state !== 'current' && r.state !== 'not_comparable').sort(byBidderThenDate);
  return { main, below };
}

function byAmountThenBidder(a: LevelingRow, b: LevelingRow): number {
  if (a.state !== b.state) return a.state === 'current' ? -1 : 1;
  if (a.base_amount !== null && b.base_amount !== null && a.base_amount !== b.base_amount) return a.base_amount - b.base_amount;
  if ((a.base_amount === null) !== (b.base_amount === null)) return a.base_amount === null ? 1 : -1;
  return a.bidder.localeCompare(b.bidder);
}

function byBidderThenDate(a: LevelingRow, b: LevelingRow): number {
  return a.bidder.localeCompare(b.bidder) || b.bid_date.localeCompare(a.bid_date);
}

/** The low current bid: the smallest base amount among rows that count, earliest receipt on a tie. Null without money. */
export function lowBid(rows: readonly LevelingRow[]): LevelingRow | null {
  let low: LevelingRow | null = null;
  for (const r of rows) {
    if (r.state !== 'current' || r.base_amount === null) continue;
    if (low === null || low.base_amount === null || r.base_amount < low.base_amount) low = r;
    else if (r.base_amount === low.base_amount && r.received_at < low.received_at) low = r;
  }
  return low;
}

/** Spread from low to high as a percentage of the low; null when there is no low or it is not positive. */
export function spreadPct(low: number | null, high: number | null): number | null {
  if (low === null || high === null || low <= 0) return null;
  return ((high - low) / low) * 100;
}

/** Spreads above this are worth a second look (SPEC §11.6 "summary: ... spread"). */
export const SPREAD_WARN = 50;

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export interface PackageSummary {
  id: string;
  code: string;
  name: string;
  /** Current comparable bids. */
  bids: number;
  low: LevelingRow | null;
  high: number | null;
  spread: number | null;
  flags: FlagRow[];
}

/** One line per package in code order. Money fields stay null when the board carries no money. */
export function summarize(packages: readonly PackageRow[], rows: readonly LevelingRow[], flags: readonly FlagRow[]): PackageSummary[] {
  return [...packages]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => {
      const mine = rows.filter((r) => r.package_id === p.id);
      const current = mine.filter((r) => r.state === 'current');
      const amounts = current.map((r) => r.base_amount).filter((a): a is number => a !== null);
      const low = lowBid(mine);
      const high = amounts.length > 0 ? Math.max(...amounts) : null;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        bids: current.length,
        low,
        high,
        spread: spreadPct(low?.base_amount ?? null, high),
        flags: flags.filter((f) => f.package_id === p.id),
      };
    });
}

export function sumOfLows(summaries: readonly PackageSummary[]): number {
  return summaries.reduce((sum, s) => sum + (s.low?.base_amount ?? 0), 0);
}

/** Flag chips: red for what makes a bid unusable, amber for what changed or aged, yellow for thin coverage. */
export function flagChip(f: Pick<FlagRow, 'kind' | 'detail'>): Chip {
  switch (f.kind) {
    case 'pw_not_stated':
      return { status: 'blocked', label: f.detail.toLowerCase().includes('excluded') ? 'PW excluded' : 'PW not stated' };
    case 'mismatch':
      return { status: 'blocked', label: 'Different project' };
    case 'no_bids':
      return { status: 'blocked', label: 'No bids' };
    case 'stale':
      return { status: 'postponed', label: f.detail === '' ? 'Expired' : f.detail };
    case 'escalation':
      return { status: 'postponed', label: f.detail === '' ? 'Escalation' : f.detail };
    case 'single_bid':
      return { status: 'pending', label: 'Single bid' };
    default:
      return { status: 'assigned', label: f.detail === '' ? humanize(f.kind) : f.detail };
  }
}

const STATE_LABELS: Record<LevelingState, string> = {
  current: '',
  not_comparable: 'Not comparable',
  superseded: 'Superseded',
  duplicate: 'Duplicate',
  backup: 'Backup',
};

export function stateLabel(state: LevelingState): string {
  return STATE_LABELS[state];
}

const PW_LABELS: Record<string, string> = {
  included: 'Included',
  excluded: 'Excluded',
  adder: 'Adder',
  not_stated: 'Not stated',
};

export function pwLabel(pw: string | null): string {
  if (pw === null) return '-';
  return PW_LABELS[pw] ?? humanize(pw);
}

/** Row flags keyed by submission; package-level flags (no submission) keyed by package. */
export function indexFlags(flags: readonly FlagRow[]): { byRow: Map<string, FlagRow[]>; byPackage: Map<string, FlagRow[]> } {
  const byRow = new Map<string, FlagRow[]>();
  const byPackage = new Map<string, FlagRow[]>();
  for (const f of flags) {
    const key = f.submission_id ?? f.package_id;
    const map = f.submission_id === null ? byPackage : byRow;
    map.set(key, [...(map.get(key) ?? []), f]);
  }
  return { byRow, byPackage };
}
