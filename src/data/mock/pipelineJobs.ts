// Synthetic jobs in the bid stages for the e2e mock (the bids pipeline across jobs): prospects with and without a
// bid date, jobs bidding this week, one past bid time waiting on the award, one awarded, one lost. Obviously fake names
// (CLAUDE.md rule 8). Bid dates are relative to today in the job's zone, so the screen reads the same on any day.
// Their names sort after the Sample Job A/B fixtures, so the job picker's first options stay those two.
import { addDays, format, parseISO } from 'date-fns';
import { fromZonedInput, todayInZone } from '../../lib/dates';
import type { ProjectRow } from '../types';

const TZ = 'America/Los_Angeles';

interface PipelineCounts {
  packages: number;
  packages_covered: number;
  bids_in: number;
  invited: number;
  open_questions: number;
}

interface PipelineSeed {
  id: string;
  name: string;
  number: string;
  stage: 'prospect' | 'bidding' | 'awarded' | 'lost';
  /** Days from today (negative = past); null = no bid date yet. */
  dueIn: number | null;
  counts: PipelineCounts;
}

const NONE: PipelineCounts = { packages: 0, packages_covered: 0, bids_in: 0, invited: 0, open_questions: 0 };

const SEEDS: PipelineSeed[] = [
  {
    id: 'job-p1',
    name: 'Sample Library Addition',
    number: 'S-310',
    stage: 'bidding',
    dueIn: 3,
    counts: { packages: 33, packages_covered: 17, bids_in: 17, invited: 83, open_questions: 3 }, // = mock/packages + coverage
  },
  {
    id: 'job-p2',
    name: 'Sample Park Restroom Replacement',
    number: 'S-320',
    stage: 'bidding',
    dueIn: 1,
    counts: { packages: 6, packages_covered: 5, bids_in: 9, invited: 18, open_questions: 1 },
  },
  {
    id: 'job-p3',
    name: 'Sample Transit Shelter Upgrades at Five Corridor Stops, Phase 2 with Lighting and Accessible Paths',
    number: 'S-330',
    stage: 'prospect',
    dueIn: null,
    counts: NONE,
  },
  {
    id: 'job-p4',
    name: 'Sample Office Tenant Improvement',
    number: 'S-340',
    stage: 'prospect',
    dueIn: 12,
    counts: { packages: 4, packages_covered: 0, bids_in: 0, invited: 6, open_questions: 0 },
  },
  {
    id: 'job-p5',
    name: 'Sample Station Remodel',
    number: 'S-300',
    stage: 'bidding',
    dueIn: -2,
    counts: { packages: 10, packages_covered: 10, bids_in: 26, invited: 38, open_questions: 0 },
  },
  {
    id: 'job-p6',
    name: 'Sample School Modernization',
    number: 'S-280',
    stage: 'awarded',
    dueIn: -18,
    counts: { packages: 18, packages_covered: 18, bids_in: 41, invited: 72, open_questions: 0 },
  },
  {
    id: 'job-p7',
    name: 'Sample Pool House',
    number: 'S-290',
    stage: 'lost',
    dueIn: -30,
    counts: { packages: 8, packages_covered: 8, bids_in: 17, invited: 24, open_questions: 0 },
  },
];

function dueAt(days: number | null): string | null {
  if (days === null) return null;
  const day = format(addDays(parseISO(todayInZone(TZ)), days), 'yyyy-MM-dd');
  return fromZonedInput(`${day}T14:00`, TZ);
}

/** The pipeline fixture jobs as project rows (Sample Builders; bids, files and calendar on). */
export function pipelineJobRows(): ProjectRow[] {
  return SEEDS.map((s) => ({
    id: s.id,
    org_id: 'org-sample',
    name: s.name,
    number: s.number,
    address: null,
    timezone: TZ,
    stage: s.stage,
    modules: ['bids', 'files', 'calendar'],
    settings: {},
    version: 1,
    job_type: null,
    prevailing_wage: true,
    bid_due_at: dueAt(s.dueIn),
    bid_sealed: false,
    is_dsa: false,
  }));
}

/** A job's pipeline counts: the fixture's, or none for a job made in this test. */
export function pipelineCounts(projectId: string): PipelineCounts {
  return SEEDS.find((s) => s.id === projectId)?.counts ?? NONE;
}
