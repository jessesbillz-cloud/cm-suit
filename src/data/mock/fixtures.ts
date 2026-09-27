// Synthetic e2e fixtures. Obviously fake names and ids: no job, customer or user data (CLAUDE.md rule 8).
import type { ActivityRow, BoardLine, FileRow, FolderRow, MyOrg, MyProject, Person, ProfileRow, RoleRow, TaskRow } from '../types';

const TZ = 'America/Los_Angeles';

/** The mock user with no company and no jobs yet: the first-run screens. */
export const NEWCOMER_ID = 'mock-user-newcomer';

export const MOCK_ORGS: MyOrg[] = [{ org_id: 'org-sample', name: 'Sample Builders', kind: 'gc', org_role: 'owner', version: 1 }];

/** What projects.modules defaults to for a new job. */
export const MOCK_DEFAULT_MODULES = ['bids', 'files', 'calendar'];

export const MOCK_PROJECTS: MyProject[] = [
  {
    project_id: 'job-a',
    name: 'Sample Job A',
    number: 'S-100',
    org_name: 'Sample Builders',
    role: 'pm',
    stage: 'construction',
    timezone: TZ,
    modules: MOCK_DEFAULT_MODULES,
  },
  {
    project_id: 'job-b',
    name: 'Sample Job B',
    number: 'S-200',
    org_name: 'Sample Builders',
    role: 'pm',
    stage: 'construction',
    timezone: TZ,
    modules: MOCK_DEFAULT_MODULES,
  },
];

export const MOCK_FOLDERS: FolderRow[] = MOCK_PROJECTS.map((p) => ({
  id: `${p.project_id}-plans`,
  project_id: p.project_id,
  parent_id: null,
  name: 'Plans',
  kind: 'plans',
  view_only: false,
  proprietary: false,
}));

export const MOCK_FILES: FileRow[] = MOCK_PROJECTS.map((p, i) => ({
  id: `${p.project_id}-file-1`,
  project_id: p.project_id,
  folder_id: `${p.project_id}-plans`,
  original_name: `Sample Plan Set ${i === 0 ? 'A' : 'B'}.pdf`,
  mime: 'application/pdf',
  size: 48_213,
  scan_status: 'clean',
  upload_complete: true,
  created_at: '2026-09-20T16:00:00Z',
  created_by: 'mock-someone',
}));

const LINE_BASE = Date.parse('2026-09-25T20:00:00Z');

type LineSeed = [projectId: string, kind: string, summary: string, entityType: string | null, entityId: string | null];

const LINE_SEEDS: LineSeed[] = [
  ['job-a', 'file.uploaded', 'Sample Plan Set A.pdf was added to Plans', 'file', 'job-a-file-1'],
  ['job-a', 'member.joined', 'A sample reviewer joined the job', null, null],
  ['job-b', 'file.uploaded', 'Sample Plan Set B.pdf was added to Plans', 'file', 'job-b-file-1'],
  ['job-b', 'note', 'Sample site walk moved to Thursday', null, null],
];

export const MOCK_ACTIVITY: ActivityRow[] = LINE_SEEDS.map(([project_id, kind, summary, entity_type, entity_id], i) => ({
  id: `line-${String(i + 1)}`,
  project_id,
  kind,
  summary,
  entity_type,
  entity_id,
  actor_user_id: 'mock-someone',
  created_at: new Date(LINE_BASE - i * 3_600_000).toISOString(),
}));

export function toBoardLine(a: ActivityRow, unread: boolean): BoardLine {
  const project = MOCK_PROJECTS.find((p) => p.project_id === a.project_id);
  return {
    id: a.id,
    created_at: a.created_at,
    project_id: a.project_id,
    project_name: project?.name ?? '',
    kind: a.kind,
    entity_type: a.entity_type ?? '',
    entity_id: a.entity_id ?? '',
    summary: a.summary,
    actor_user_id: a.actor_user_id ?? '',
    unread,
  };
}

export const MOCK_TASKS: TaskRow[] = [
  {
    id: 'task-1',
    project_id: 'job-a',
    kind: 'review',
    title: 'Review the sample plan set',
    entity_type: 'file',
    entity_id: 'job-a-file-1',
    due_at: '2026-09-30T00:00:00Z',
    requires_signature: false,
    version: 1,
  },
];

export const MOCK_PEOPLE: Person[] = [
  { user_id: 'mock-user-pm', member_id: 'member-1', full_name: 'Sample PM', company: 'Sample Builders', role: 'pm', status: 'active', access_ends_at: null },
  { user_id: 'mock-someone', member_id: 'member-2', full_name: 'Sample Reviewer', company: 'Sample Design', role: 'architect', status: 'active', access_ends_at: null },
];

export const MOCK_ROLES: RoleRow[] = [
  { name: 'pm', description: 'Project manager' },
  { name: 'architect', description: 'Architect / engineer of record' },
  { name: 'viewer', description: 'Read-only' },
];

export function mockProfile(userId: string, email: string): ProfileRow {
  return { user_id: userId, email, full_name: 'Sample PM', phone: null, title: null, company: 'Sample Builders', timezone: TZ, timezone_set_by_user: false, version: 1 };
}
