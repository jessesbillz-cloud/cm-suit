import { describe, expect, it } from 'vitest';
import type { FlagRow, LevelingRow, PackageRow } from '../../data/bids.types';
import { flagChip, formatPct, indexFlags, lowBid, spreadPct, splitRows, sumOfLows, summarize } from './leveling';

function row(id: string, pkg: string, bidder: string, amount: number | null, state: LevelingRow['state'] = 'current', received = '2026-09-20T17:00:00Z'): LevelingRow {
  return {
    submission_id: id,
    package_id: pkg,
    package_code: pkg,
    original_package_id: pkg,
    bidder,
    bidder_key: bidder.toLowerCase(),
    bid_date: '2026-09-20',
    received_at: received,
    receipt_number: 1,
    is_late: false,
    document_kind: null,
    prevailing_wage: 'included',
    validity_days: null,
    valid_until: null,
    exclusions: [],
    project_match: null,
    extraction_status: null,
    state,
    replaced_by: null,
    comparable: state !== 'not_comparable',
    is_duplicate: state === 'duplicate',
    is_backup: state === 'backup',
    notes: '',
    leveling_version: null,
    file_id: `${id}-file`,
    base_amount: amount,
    base_evidence: null,
    base_page: null,
    pw_adder_amount: null,
  };
}

const PKGS: PackageRow[] = [
  { id: '09A', project_id: 'j', code: '09A', name: 'Drywall', scope_text: '', version: 1 },
  { id: '03A', project_id: 'j', code: '03A', name: 'Concrete', scope_text: '', version: 1 },
  { id: '22A', project_id: 'j', code: '22A', name: 'Plumbing', scope_text: '', version: 1 },
];

describe('splitRows', () => {
  it('keeps current and not-comparable rows in the grid (low first, no money last) and the rest below', () => {
    const rows = [
      row('a', '03A', 'Zed Co', null),
      row('b', '03A', 'Able Co', 120),
      row('c', '03A', 'Old Co', 90, 'superseded'),
      row('d', '03A', 'Baker Co', 100),
      row('e', '03A', 'Aside Co', 50, 'not_comparable'),
      row('f', '03A', 'Copy Co', 100, 'duplicate'),
    ];
    const { main, below } = splitRows(rows);
    expect(main.map((r) => r.submission_id)).toEqual(['d', 'b', 'a', 'e']);
    expect(below.map((r) => r.submission_id)).toEqual(['f', 'c']);
  });
});

describe('lowBid', () => {
  it('picks the smallest current amount, earliest receipt on a tie, ignoring rows that do not count', () => {
    const rows = [
      row('later', '03A', 'B', 100, 'current', '2026-09-21T00:00:00Z'),
      row('first', '03A', 'A', 100, 'current', '2026-09-20T00:00:00Z'),
      row('cheap-but-aside', '03A', 'C', 10, 'not_comparable'),
      row('cheap-but-old', '03A', 'D', 10, 'superseded'),
    ];
    expect(lowBid(rows)?.submission_id).toBe('first');
  });
  it('is null without money', () => {
    expect(lowBid([row('a', '03A', 'A', null)])).toBeNull();
  });
});

describe('spreadPct / formatPct', () => {
  it('is the rise from low to high over the low', () => {
    expect(spreadPct(100, 150)).toBe(50);
    expect(formatPct(spreadPct(80, 100) ?? 0)).toBe('25.0%');
  });
  it('is null without a positive low', () => {
    expect(spreadPct(null, 100)).toBeNull();
    expect(spreadPct(0, 100)).toBeNull();
    expect(spreadPct(100, null)).toBeNull();
  });
});

describe('summarize / sumOfLows', () => {
  const flags: FlagRow[] = [
    { package_id: '22A', submission_id: null, kind: 'no_bids', detail: 'No bids' },
    { package_id: '09A', submission_id: 'x', kind: 'pw_not_stated', detail: 'Prevailing wage not stated' },
  ];
  const rows = [row('x', '09A', 'Drywall Co', 80), row('y', '03A', 'Concrete Co', 100), row('z', '03A', 'Paving Co', 160), row('w', '03A', 'Old Co', 50, 'superseded')];
  const s = summarize(PKGS, rows, flags);

  it('gives one line per package in code order with count, low, high, spread and flags', () => {
    expect(s.map((p) => p.code)).toEqual(['03A', '09A', '22A']);
    expect(s[0]).toMatchObject({ bids: 2, high: 160, spread: 60 });
    expect(s[0]?.low?.submission_id).toBe('y');
    expect(s[1]).toMatchObject({ bids: 1, high: 80, spread: 0 });
    expect(s[1]?.flags.map((f) => f.kind)).toEqual(['pw_not_stated']);
    expect(s[2]).toMatchObject({ bids: 0, low: null, high: null, spread: null });
    expect(s[2]?.flags.map((f) => f.kind)).toEqual(['no_bids']);
  });
  it('sums the lows, skipping packages without one', () => {
    expect(sumOfLows(s)).toBe(180);
  });
});

describe('flagChip', () => {
  it('maps each kind to a status color and a short label', () => {
    expect(flagChip({ kind: 'pw_not_stated', detail: 'Prevailing wage excluded' })).toEqual({ status: 'blocked', label: 'PW excluded' });
    expect(flagChip({ kind: 'pw_not_stated', detail: 'Prevailing wage not stated' })).toEqual({ status: 'blocked', label: 'PW not stated' });
    expect(flagChip({ kind: 'mismatch', detail: 'Different project' }).status).toBe('blocked');
    expect(flagChip({ kind: 'stale', detail: 'Expired 10/28/2024' })).toEqual({ status: 'postponed', label: 'Expired 10/28/2024' });
    expect(flagChip({ kind: 'escalation', detail: '+28.7% since 10/28/2024' })).toEqual({ status: 'postponed', label: '+28.7% since 10/28/2024' });
    expect(flagChip({ kind: 'single_bid', detail: 'One bid' })).toEqual({ status: 'pending', label: 'Single bid' });
    expect(flagChip({ kind: 'scope_gap', detail: '' })).toEqual({ status: 'assigned', label: 'Scope gap' });
  });
});

describe('indexFlags', () => {
  it('splits row flags from package flags', () => {
    const { byRow, byPackage } = indexFlags([
      { package_id: 'p', submission_id: 's', kind: 'stale', detail: '' },
      { package_id: 'p', submission_id: null, kind: 'single_bid', detail: '' },
    ]);
    expect(byRow.get('s')?.map((f) => f.kind)).toEqual(['stale']);
    expect(byPackage.get('p')?.map((f) => f.kind)).toEqual(['single_bid']);
  });
});
