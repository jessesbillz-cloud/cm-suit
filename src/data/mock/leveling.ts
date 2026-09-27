// Synthetic leveling fixtures for the e2e mock (SPEC §11.6): Sample Job A has two packages; 03A has two bidders
// (one with an earlier, lower price and a backup file), 09A has a single bid with no prevailing-wage statement.
// Manager writes are not simulated (see notInMock in ./bids).
import type { FlagRow, LevelingRow, SubmissionRow } from '../bids.types';
import { delay } from './store';

const JOB = 'job-a';

function row(
  id: string,
  pkg: [id: string, code: string],
  bidder: string,
  bidDate: string,
  state: LevelingRow['state'],
  money: [amount: number, evidence: string, page: number],
  extra: Partial<LevelingRow> = {},
): LevelingRow {
  return {
    submission_id: id,
    package_id: pkg[0],
    package_code: pkg[1],
    original_package_id: pkg[0],
    bidder,
    bidder_key: bidder.toLowerCase().replace(/[^a-z0-9]/g, ''),
    bid_date: bidDate,
    received_at: `${bidDate}T17:00:00Z`,
    receipt_number: Number(id.slice(-1)),
    is_late: false,
    document_kind: 'proposal',
    prevailing_wage: 'included',
    validity_days: 90,
    valid_until: '2026-12-15',
    exclusions: [],
    project_match: 'match',
    extraction_status: 'confirmed',
    state,
    replaced_by: null,
    comparable: true,
    is_duplicate: false,
    is_backup: false,
    notes: '',
    leveling_version: null,
    file_id: `${id}-file`,
    base_amount: money[0],
    base_evidence: money[1],
    base_page: money[2],
    pw_adder_amount: null,
    ...extra,
  };
}

const P1: [string, string] = ['pkg-1', '03A'];
const P2: [string, string] = ['pkg-2', '09A'];

const BOARD: LevelingRow[] = [
  row('lb-1', P1, 'Sample Concrete Co', '2026-09-20', 'current', [100000, 'Base bid: $100,000.00', 2], { exclusions: ['Rebar by others'] }),
  row('lb-2', P1, 'Sample Paving Co', '2026-09-22', 'current', [110000, 'Total $110,000', 1]),
  row('lb-3', P1, 'Sample Paving Co', '2026-08-10', 'superseded', [95000, 'Total $95,000', 1], { replaced_by: 'lb-2' }),
  row('lb-4', P1, 'Sample Concrete Co', '2026-09-20', 'backup', [100000, 'Base bid: $100,000.00', 2], { is_backup: true, replaced_by: 'lb-1', leveling_version: 1 }),
  row('lb-5', P2, 'Sample Drywall Co', '2026-09-18', 'current', [80000, 'Lump sum 80,000', 3], {
    prevailing_wage: 'not_stated',
    validity_days: 30,
    valid_until: '2026-10-18',
    exclusions: ['Level 5 finish', 'Patching after other trades'],
  }),
];

const FLAGS: FlagRow[] = [
  { package_id: 'pkg-1', submission_id: 'lb-2', kind: 'escalation', detail: '+15.8% since 8/10/2026' },
  { package_id: 'pkg-2', submission_id: 'lb-5', kind: 'pw_not_stated', detail: 'Prevailing wage not stated' },
  { package_id: 'pkg-2', submission_id: null, kind: 'single_bid', detail: 'One bid' },
];

export async function board(projectId: string): Promise<LevelingRow[]> {
  await delay();
  return projectId === JOB ? BOARD : [];
}

export async function flags(projectId: string): Promise<FlagRow[]> {
  await delay();
  return projectId === JOB ? FLAGS : [];
}

/** The Received list and the submission pane read this shape; one row per board row. */
export async function submissions(projectId: string): Promise<SubmissionRow[]> {
  await delay();
  if (projectId !== JOB) return [];
  return BOARD.map((r) => ({
    id: r.submission_id,
    package_id: r.package_id,
    member_id: null,
    file_id: r.file_id,
    receipt_number: r.receipt_number,
    received_at: r.received_at,
    is_late: r.is_late,
    version_no: 1,
  }));
}
