// Two synthetic jobs for the permits mock (CLAUDE.md rule 8: obviously fake): "Sample Science Building", which every
// mock user is on, and "Sample Library Annex", which only the fire / building official ('ahj') is on, so the official's
// caseload spans two jobs. The official is on nothing else. Each job has an "Approved plans" folder (the approved set
// the permit page links to). Names sort after the other sample jobs in the job picker.
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
    modules: ['calendar', 'files', 'inspections', 'permits'],
    settings: {},
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

/** Plans, Specs, Approved plans and Reports on each permit job. */
export const PERMIT_JOB_FOLDERS: FolderRow[] = JOBS.flatMap((j) =>
  (
    [
      ['plans', 'plans', 'Plans', 10],
      ['specs', 'specs', 'Specs', 20],
      ['approved', 'plans', 'Approved plans', 25],
      ['reports', 'reports', 'Reports', 50],
    ] as const
  ).map(([suffix, kind, name, sort]): FolderRow => ({
    id: `${j.id}-${suffix}`,
    project_id: j.id,
    parent_id: null,
    name,
    kind,
    view_only: false,
    proprietary: false,
    sort,
    ai_reads: kind !== 'reports',
    version: 1,
    file_count: null,
  })),
);

/** One stamped set in each job's Approved plans. */
export const PERMIT_JOB_FILES: FileRow[] = JOBS.map((j, i) => ({
  id: `${j.id}-approved-1`,
  project_id: j.id,
  folder_id: `${j.id}-approved`,
  original_name: `Sample Approved Set ${i === 0 ? '24-0001' : '25-0102'}.pdf`,
  mime: 'application/pdf',
  size: 18_204_113,
  scan_status: 'clean',
  upload_complete: true,
  created_at: '2026-06-02T16:00:00Z',
  created_by: 'mock-user-ahj',
}));
