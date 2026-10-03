// Synthetic schedules for the e2e mock (CLAUDE.md rule 8: obviously fake names). Sample Job A: Update 3 from an XER,
// data date six days back, with activities done, underway, this week, the coming weeks and two months out (a long name
// to prove rows wrap), and Update 2 before it. Sample Science Building: Update 1 from a CSV, 40 days old (an update is
// due). Sample Job B: none yet. Dates are days from the job's today, so the look-ahead always has something to show.
import type { DraftRow, VersionRow } from '../schedule.types';

export const TZ = 'America/Los_Angeles';

export interface StoredVersion extends VersionRow {
  project_id: string;
  model: string | null;
  warnings: string[];
  deleted: boolean;
  created_by: string;
  published_by: string | null;
  supersedes_id: string | null;
}

export interface StoredActivity extends DraftRow {
  project_id: string;
  deleted: boolean;
}

type Seed = [code: string | null, name: string, start: number | null, finish: number | null, area: string | null, trade: string | null, done?: 'underway' | 'done' | null, milestone?: true];

const JOB_A: Seed[] = [
  ['A1000', 'Mobilize and site fencing', -60, -55, null, 'Sample Builders', 'done'],
  ['A1100', 'Footings and foundations', -50, -20, 'Building A', 'Sample Concrete Co', 'done'],
  ['A1300', 'Exterior framing, north side', -8, 9, 'North elevation', 'Sample Framing Co', 'underway'],
  ['A1210', 'Level 2 deck: rebar and embeds', -4, 2, 'Level 2', 'Sample Rebar Co', 'underway'],
  ['A1220', 'Level 2 deck pour', 1, 1, 'Level 2', 'Sample Concrete Co'],
  ['M100', 'Level 2 deck complete', 2, 2, 'Level 2', null, null, true],
  ['A1400', 'Underground plumbing, building B', 3, 10, 'Building B', 'Sample Plumbing'],
  ['A1500', 'Level 3 deck: rebar and embeds', 8, 14, 'Level 3', 'Sample Rebar Co'],
  ['A2010', 'Hang drywall, Level 1 east', 12, 24, 'Level 1', 'Sample Drywall Co'],
  ['A1510', 'Level 3 deck pour', 15, 15, 'Level 3', 'Sample Concrete Co'],
  ['A2100', 'Fire sprinkler rough-in, Level 1', 16, 27, 'Level 1', 'Sample Fire Protection'],
  ['A2150', 'Install fire-rated head-of-wall joint system at the corridor partitions, Level 2 north wing, grids 4 through 9', 18, 22, 'Level 2', 'Sample Drywall Co'],
  ['A2200', 'Above-ceiling inspection, Level 1', 28, 29, 'Level 1', null],
  ['M200', 'Building dry-in', 33, 33, null, null, null, true],
  ['A3100', 'Restroom wall tile, Level 1', 40, 49, 'Level 1 restrooms', 'Sample Tile Co'],
  ['A3200', 'Elevator install', 45, 70, 'Core', 'Sample Elevator Co'],
  ['A3110', 'Toilet accessories install (owner-furnished)', 52, 54, 'Level 1 restrooms', 'Sample Specialties'],
  ['M300', 'Substantial completion', 120, 120, null, null, null, true],
];

const JOB_A_OLD: Seed[] = [
  ['A1000', 'Mobilize and site fencing', -60, -55, null, 'Sample Builders', 'done'],
  ['A1100', 'Footings and foundations', -50, -24, 'Building A', 'Sample Concrete Co', 'underway'],
  ['A1300', 'Exterior framing, north side', -12, 5, 'North elevation', 'Sample Framing Co'],
  ['M200', 'Building dry-in', 30, 30, null, null, null, true],
  ['M300', 'Substantial completion', 115, 115, null, null, null, true],
];

const JOB_S: Seed[] = [
  [null, 'Lab casework install, room 210', -2, 6, 'Level 2 labs', 'Sample Casework'],
  [null, 'Fume hood ductwork', 5, 16, 'Level 2 labs', 'Sample Mechanical'],
  [null, 'Ceiling grid, level 2 corridor', 9, 13, 'Level 2', 'Sample Ceilings'],
  [null, 'Fire alarm devices, level 2', 20, 30, 'Level 2', 'Sample Fire Alarm'],
];

/** yyyy-MM-dd n days from `today` (a calendar day, no zone). */
export function shift(today: string, n: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rows(versionId: string, projectId: string, seeds: Seed[], today: string): StoredActivity[] {
  const day = (n: number | null) => (n === null ? null : shift(today, n));
  return seeds.map(([code, name, start, finish, area, trade, done, milestone], i) => ({
    id: `${versionId}-a${String(i + 1)}`, version_id: versionId, project_id: projectId, activity_code: code, name, wbs: null, area, trade,
    start_date: day(start), finish_date: day(finish), actual_start: done ? day(start) : null, actual_finish: done === 'done' ? day(finish) : null,
    percent: done === 'done' ? 100 : done === 'underway' ? 50 : 0, is_milestone: milestone === true, csi_division: null, sort: i + 1,
    unsure: false, source_ref: `row ${String(i + 1)}`, version: 1, deleted: false,
  }));
}

function version(over: Partial<StoredVersion> & Pick<StoredVersion, 'id' | 'project_id' | 'status' | 'source_kind'>): StoredVersion {
  return {
    number: null, title: null, data_date: null, file_id: null, file_name: null, created_at: new Date().toISOString(),
    created_by_name: 'Sol Sample', published_at: null, published_by_name: null, activities: 0, version: 1, model: null, warnings: [],
    deleted: false, created_by: 'mock-user-super', published_by: null, supersedes_id: null, ...over,
  };
}

/** The mock's starting schedules, for the job's today. */
export function seedSchedules(today: string, now: number): { versions: StoredVersion[]; activities: StoredActivity[] } {
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const activities = [
    ...rows('mock-sched-a3', 'job-a', JOB_A, today),
    ...rows('mock-sched-a2', 'job-a', JOB_A_OLD, shift(today, -31)),
    ...rows('mock-sched-s1', 'job-s', JOB_S, today),
  ];
  const count = (id: string) => activities.filter((a) => a.version_id === id).length;
  const versions = [
    version({
      id: 'mock-sched-a3', project_id: 'job-a', status: 'current', source_kind: 'xer', number: 3, title: 'Sample Job A Master Schedule',
      data_date: shift(today, -6), file_id: 'mock-sched-file-a3', file_name: 'Sample Job A Update 3.xer', created_at: at(-5),
      published_at: at(-5), published_by_name: 'Sol Sample', published_by: 'mock-user-super', activities: count('mock-sched-a3'),
      supersedes_id: 'mock-sched-a2',
    }),
    version({
      id: 'mock-sched-a2', project_id: 'job-a', status: 'superseded', source_kind: 'xer', number: 2, title: 'Sample Job A Master Schedule',
      data_date: shift(today, -37), file_id: 'mock-sched-file-a2', file_name: 'Sample Job A Update 2.xer', created_at: at(-36),
      published_at: at(-36), published_by_name: 'Sol Sample', published_by: 'mock-user-super', activities: count('mock-sched-a2'),
    }),
    version({
      id: 'mock-sched-s1', project_id: 'job-s', status: 'current', source_kind: 'csv', number: 1, data_date: shift(today, -40),
      file_id: 'mock-sched-file-s1', file_name: 'Sample Science Look-ahead.csv', created_at: at(-40), published_at: at(-40),
      published_by_name: 'Pat Sample', published_by: 'mock-user-pm', activities: count('mock-sched-s1'),
    }),
  ];
  return { versions, activities };
}

/** What a mock "read" of a PDF or a photo gives: a few rows, one without dates and one to check. */
export const READ_ROWS: Seed[] = [
  [null, 'Sample framing inspection, level 2', 3, 3, 'Level 2', null],
  [null, 'Sample hang drywall, level 2', 4, 12, 'Level 2', 'Sample Drywall Co'],
  [null, 'Sample tape and finish, level 2', null, null, 'Level 2', null],
  [null, 'Sample paint, level 2', 14, 20, 'Level 2', 'Sample Painting'],
];

/** What a mock XER or Project XML gives. */
export const FILE_ROWS: Seed[] = [
  ['B100', 'Sample site utilities', -5, 6, 'Site', 'Sample Civil Co', 'underway'],
  ['B200', 'Sample slab on grade', 4, 8, 'Building', 'Sample Concrete Co'],
  ['B300', 'Sample steel erection', 10, 30, 'Building', 'Sample Steel Co'],
  ['B900', 'Sample topping out', 31, 31, null, null, null, true],
];

export function draftRows(versionId: string, projectId: string, seeds: Seed[], today: string, unsure: number[] = []): StoredActivity[] {
  return rows(versionId, projectId, seeds, today).map((r, i) => ({ ...r, unsure: unsure.includes(i) || r.start_date === null }));
}
