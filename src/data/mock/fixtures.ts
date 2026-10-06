// Synthetic e2e fixtures. Obviously fake names and ids: no job, customer or user data (CLAUDE.md rule 8).
import type { ActivityRow, BoardLine, FileRow, MyOrg, MyProject, Person, ProfileRow, RoleRow, TaskRow } from '../types';
import { SEED_CN_ID, SEED_DAILY_ID, SEED_FILES, SEED_IR_ID, SEED_RFI_ID } from './boardSeeds';
import { IR_SEED_FILES } from './irSeeds';
import { PERMIT_JOB_FILES } from './permitJobs';

const TZ = 'America/Los_Angeles';

/** The mock user with no company and no jobs yet: the first-run screens. */
export const NEWCOMER_ID = 'mock-user-newcomer';

export const MOCK_ORGS: MyOrg[] = [{ org_id: 'org-sample', name: 'Sample Builders', kind: 'gc', org_role: 'owner', version: 1 }];

/** What projects.modules defaults to for a new job. */
export const MOCK_DEFAULT_MODULES = ['bids', 'files', 'calendar'];

/** The sample jobs are being built, so they have the field tools too (0021 tg_project_field_modules). */
const MOCK_JOB_MODULES = [...MOCK_DEFAULT_MODULES, 'dailies', 'inspections', 'deliveries', 'corrections', 'rfis', 'safety', 'schedule', 'requirements'];

export const MOCK_PROJECTS: MyProject[] = [
  {
    project_id: 'job-a',
    name: 'Sample Job A',
    number: 'S-100',
    org_name: 'Sample Builders',
    role: 'pm',
    stage: 'construction',
    timezone: TZ,
    modules: MOCK_JOB_MODULES,
  },
  {
    project_id: 'job-b',
    name: 'Sample Job B',
    number: 'S-200',
    org_name: 'Sample Builders',
    role: 'pm',
    stage: 'construction',
    timezone: TZ,
    modules: MOCK_JOB_MODULES,
  },
];

export const MOCK_FILES: FileRow[] = [
  ...MOCK_PROJECTS.map((p, i): FileRow => ({
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
  })),
  ...SEED_FILES,
  ...IR_SEED_FILES,
  ...PERMIT_JOB_FILES,
  // Long names prove every list wraps a title instead of cutting it (one with spaces, one with none).
  ...[
    '211313_01.4_Fire Sprinkler System Design Package_Sample Co_Rev 2.pdf',
    'Sample_Level_2_Mechanical_Coordination_Drawing_Set_Rev_14_Combined_For_Review.pdf',
  ].map((name, i): FileRow => ({
    id: `job-a-file-long-${String(i + 1)}`,
    project_id: 'job-a',
    folder_id: 'job-a-plans',
    original_name: name,
    mime: 'application/pdf',
    size: 3_482_113 * (i + 1),
    scan_status: 'clean',
    upload_complete: true,
    created_at: '2026-09-22T16:00:00Z',
    created_by: 'mock-someone',
  })),
];

const LINE_BASE = Date.parse('2026-09-25T20:00:00Z');

type LineSeed = [projectId: string, kind: string, summary: string, entityType: string | null, entityId: string | null];

const LINE_SEEDS: LineSeed[] = [
  ['job-a', 'file.uploaded', 'Sample Plan Set A.pdf was added to Plans', 'file', 'job-a-file-1'],
  ['job-a', 'member.joined', 'A sample reviewer joined the job', null, null],
  ['job-b', 'file.uploaded', 'Sample Plan Set B.pdf was added to Plans', 'file', 'job-b-file-1'],
  ['job-b', 'note', 'Sample site walk moved to Thursday', null, null],
  // One line per kind of record the board opens (the records live in each module's mock).
  ['job-a', 'delivery.posted', 'Delivery #3: Sample Steel Co', 'delivery', 'mock-delivery-3'],
  ['job-b', 'ir.results', 'IR 12 results: Approved', 'inspection_request', SEED_IR_ID],
  ['job-b', 'correction.opened', 'CN-004 opened: Sample missing firestop at corridor penetrations', 'correction', SEED_CN_ID],
  ['job-b', 'daily.submitted', 'Sample Inspector submitted Daily report #7 for Sep 25', 'daily_report', SEED_DAILY_ID],
  ['job-a', 'addendum.issued', 'Addendum 1 issued: Sample schedule change', 'addendum', 'add-1'],
  ['job-a', 'bid.question', 'Pre-bid question 1', 'bid_question', 'q-1'],
  ['job-a', 'bid.answer', 'Answer 2 published', 'published_answer', 'answer-2'],
  ['job-a', 'rfi.impact_claimed', 'RFI 002 impact claimed: Sample storefront head anchor spacing at grid C', 'rfi', SEED_RFI_ID],
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

/** The mock's tasks; `assignee` (a mock user id) keeps a task to that user, the rest are everyone's. */
export const MOCK_TASKS: (TaskRow & { assignee?: string })[] = [
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
  // The bidder's addendum (bids 0011): acknowledged in place, which closes it.
  {
    id: 'task-ack-1',
    project_id: 'job-a',
    kind: 'addendum_ack',
    title: 'Acknowledge addendum 1',
    entity_type: 'addendum',
    entity_id: 'add-1',
    due_at: null,
    requires_signature: false,
    version: 1,
    assignee: 'mock-user-bidder',
  },
  // The inspector's re-inspection (corrections 0026): closed by the correction, so it opens the correction.
  {
    id: 'task-reinspect-1',
    project_id: 'job-b',
    kind: 'correction.reinspect',
    title: 'Re-inspect CN-004: Sample missing firestop at corridor penetrations',
    entity_type: 'correction',
    entity_id: SEED_CN_ID,
    due_at: null,
    requires_signature: false,
    version: 1,
    assignee: 'mock-user-inspector',
  },
];

export const MOCK_PEOPLE: Person[] = [
  { user_id: 'mock-user-pm', member_id: 'member-1', full_name: 'Sample PM', company: 'Sample Builders', role: 'pm', status: 'active', access_ends_at: null },
  { user_id: 'mock-someone', member_id: 'member-2', full_name: 'Sample Reviewer', company: 'Sample Design', role: 'architect', status: 'active', access_ends_at: null },
  { user_id: 'mock-user-inspector', member_id: 'member-3', full_name: 'Sample Inspector', company: 'Sample Inspection', role: 'inspector', status: 'active', access_ends_at: null },
  { user_id: 'mock-user-sub', member_id: 'member-4', full_name: 'Sample Sub', company: 'Sample Drywall', role: 'sub', status: 'active', access_ends_at: null },
  // Invited, not signed in yet: no user, the name is the email's first part (people_display).
  { user_id: null, member_id: 'member-5', full_name: 'sample.invitee', company: '', role: 'viewer', status: 'invited', access_ends_at: null },
];

/** As roles answers (0087): the six offered roles in their order, then roles people may still hold. */
export const MOCK_ROLES: RoleRow[] = [
  { name: 'pm', description: 'Project manager', invitable: true },
  { name: 'pe', description: 'Project engineer', invitable: true },
  { name: 'superintendent', description: 'Superintendent', invitable: true },
  { name: 'inspector', description: 'Inspector', invitable: true },
  { name: 'ahj', description: 'Fire marshal', invitable: true },
  { name: 'owner_rep', description: 'Owner / CM', invitable: true },
  { name: 'architect', description: 'Architect / engineer of record', invitable: false },
  { name: 'bidder', description: 'Invited to bid', invitable: false },
  { name: 'viewer', description: 'Read-only', invitable: false },
  { name: 'requester', description: 'Requester', invitable: false },
  { name: 'sub', description: 'Subcontractor on the job', invitable: false },
];

export function mockProfile(userId: string, email: string): ProfileRow {
  return { user_id: userId, email, full_name: 'Sample PM', phone: null, title: null, company: 'Sample Builders', timezone: TZ, timezone_set_by_user: false, version: 1 };
}
