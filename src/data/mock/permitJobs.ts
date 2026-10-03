// Two synthetic jobs for the permits mock (CLAUDE.md rule 8: obviously fake): "Sample Science Building", which every
// mock user is on, and "Sample Library Annex", which only the fire / building official ('ahj') is on, so the official's
// caseload spans two jobs. The official is on nothing else. Each job has plan PDFs to stamp and an "Approved plans"
// folder holding the stamped sets (mock/permitStamp). Names sort after the other sample jobs in the job picker.
import type { FileRow, FolderRow, ProjectRow } from '../types';
import { mockUser } from './index';

export const PERMIT_ORG = { org_id: 'org-owner', name: 'Sample State University', kind: 'owner' } as const;

const SCIENCE_JOB = 'job-s';
const LIBRARY_JOB = 'job-t';

const TZ = 'America/Los_Angeles';

function job(id: string, name: string, number: string): ProjectRow {
  return {
    id,
    org_id: PERMIT_ORG.org_id,
    name,
    number,
    address: null,
    timezone: TZ,
    stage: 'construction',
    // The fire marshal's jobs: OFS requests, and Revs with them (0056).
    modules: ['calendar', 'files', 'inspections', 'permits', 'revs'],
    settings: { ir_ofs_allowed: true },
    version: 1,
    job_type: null,
    prevailing_wage: false,
    bid_due_at: null,
    bid_sealed: false,
    is_dsa: false,
  };
}

const JOBS: readonly ProjectRow[] = [job(SCIENCE_JOB, 'Sample Science Building', 'S-500'), job(LIBRARY_JOB, 'Sample Library Annex', 'S-600')];

/** The fire / building official in the mock: on the permit jobs only. */
export function isOfficial(): boolean {
  return mockUser().id === 'mock-user-ahj';
}

/** The permit jobs the mock user is on. */
export function permitJobRows(): ProjectRow[] {
  return JOBS.filter((j) => j.id === SCIENCE_JOB || isOfficial()).map((j) => ({ ...j }));
}

/** The mock user's role on a permit job (null for any other job). */
export function permitJobRole(projectId: string): string | null {
  if (!JOBS.some((j) => j.id === projectId)) return null;
  return isOfficial() ? 'ahj' : 'pm';
}

export function permitJobName(projectId: string): string {
  return JOBS.find((j) => j.id === projectId)?.name ?? '';
}

export function permitJobZone(projectId: string): string {
  return JOBS.find((j) => j.id === projectId)?.timezone ?? TZ;
}

function folder(id: string, projectId: string, parentId: string | null, name: string, kind: string, sort: number): FolderRow {
  return {
    id, project_id: projectId, parent_id: parentId, name, kind, view_only: false, proprietary: false, sort,
    ai_reads: kind !== 'reports', version: 1, file_count: null,
  };
}

/**
 * Plans, Specs, Approved plans (made by the first stamp on a real job) and Reports on each permit job, and the
 * folders of the stamped sets seeded in mock/permitStamp: 24-0001 (with its Superseded set) and 25-0102.
 */
export const PERMIT_JOB_FOLDERS: FolderRow[] = [
  ...JOBS.flatMap((j) =>
    (
      [
        ['plans', 'plans', 'Plans', 10],
        ['specs', 'specs', 'Specs', 20],
        ['approved', 'approved_plans', 'Approved plans', 25],
        ['reports', 'reports', 'Reports', 50],
      ] as const
    ).map(([suffix, kind, name, sort]) => folder(`${j.id}-${suffix}`, j.id, null, name, kind, sort)),
  ),
  folder('mock-permit-s1-folder', SCIENCE_JOB, `${SCIENCE_JOB}-approved`, '24-0001', 'approved_plans', 100),
  folder('mock-permit-s1-superseded', SCIENCE_JOB, 'mock-permit-s1-folder', 'Superseded', 'approved_plans', 900),
  folder('mock-permit-t1-folder', LIBRARY_JOB, `${LIBRARY_JOB}-approved`, '25-0102', 'approved_plans', 100),
];

type FileSeed = [id: string, job: string, folderId: string, name: string, size: number];

/** Plan PDFs to stamp, and the stamped copies of the seeded sets (mock/permitStamp has their records). */
const FILE_SEEDS: FileSeed[] = [
  ['job-s-plan-a101', SCIENCE_JOB, `${SCIENCE_JOB}-plans`, 'Sample A-101 Floor Plan.pdf', 4_812_330],
  ['job-s-plan-a201', SCIENCE_JOB, `${SCIENCE_JOB}-plans`, 'Sample A-201 Elevations.pdf', 3_204_117],
  ['job-s-plan-s101', SCIENCE_JOB, `${SCIENCE_JOB}-plans`, 'Sample S-101 Foundation Plan.pdf', 2_911_408],
  ['job-s-plan-fp1', SCIENCE_JOB, `${SCIENCE_JOB}-plans`, 'Sample FP-1 Fire Sprinkler Plan.pdf', 1_877_052],
  ['job-s-spec-21', SCIENCE_JOB, `${SCIENCE_JOB}-specs`, 'Sample Specs Division 21.pdf', 912_554],
  ['job-t-plan-a101', LIBRARY_JOB, `${LIBRARY_JOB}-plans`, 'Sample A-101 Annex Plan.pdf', 5_102_221],
  ['mock-stamped-s1-1a', SCIENCE_JOB, 'mock-permit-s1-superseded', 'Sample A-101 Floor Plan - Approved 24-0001.pdf', 4_830_112],
  ['mock-stamped-s1-2a', SCIENCE_JOB, 'mock-permit-s1-folder', 'Sample A-101 Floor Plan - Approved 24-0001.pdf', 4_833_908],
  ['mock-stamped-s1-2b', SCIENCE_JOB, 'mock-permit-s1-folder', 'Sample A-201 Elevations - Approved 24-0001.pdf', 3_219_440],
  ['mock-stamped-t1-1a', LIBRARY_JOB, 'mock-permit-t1-folder', 'Sample A-101 Annex Plan - Approved 25-0102.pdf', 5_120_009],
  // The Level 02 sheet the revs walls start their maps on (mock/revSeeds).
  ['job-s-plan-a102', SCIENCE_JOB, `${SCIENCE_JOB}-plans`, 'Sample A-102 Level 02 Floor Plan.pdf', 4_390_771],
];

export const PERMIT_JOB_FILES: FileRow[] = FILE_SEEDS.map(([id, job, folderId, name, size]) => ({
  id,
  project_id: job,
  folder_id: folderId,
  original_name: name,
  mime: 'application/pdf',
  size,
  scan_status: 'clean',
  upload_complete: true,
  created_at: '2026-06-02T16:00:00Z',
  created_by: id.startsWith('mock-stamped') ? 'mock-user-ahj' : 'mock-user-pm',
}));
