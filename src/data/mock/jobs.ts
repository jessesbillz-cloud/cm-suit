// Mock companies and jobs: the fixture jobs (with this test's edits), jobs and companies made in this test, and the
// "newcomer" mock user who has neither yet (first-run screens).
import { conflictError } from '../errors';
import type { MyOrg, MyProject, NewJobInput, OrgPatch, ProjectPatch, ProjectRow } from '../types';
import { MOCK_DEFAULT_MODULES, MOCK_ORGS, MOCK_PROJECTS, mockProfile, NEWCOMER_ID } from './fixtures';
import { mockUser } from './index';
import { delay, readMock, writeMock } from './store';

function isNewcomer(): boolean {
  return mockUser().id === NEWCOMER_ID;
}

function fixtureRow(p: MyProject): ProjectRow {
  return {
    id: p.project_id,
    org_id: 'org-sample',
    name: p.name,
    number: p.number,
    address: null,
    timezone: p.timezone,
    stage: p.stage,
    modules: p.modules,
    settings: {},
    version: 1,
    job_type: null,
    prevailing_wage: false,
    bid_due_at: null,
    bid_sealed: false,
  };
}

/** Fixture rows (with this test's edits) plus the jobs made in this test. */
function projectRows(): ProjectRow[] {
  const saved = readMock().projects;
  const base = (isNewcomer() ? [] : MOCK_PROJECTS).map(fixtureRow).map((r) => saved.find((x) => x.id === r.id) ?? r);
  return [...base, ...saved.filter((x) => !base.some((b) => b.id === x.id))];
}

function allOrgs(): MyOrg[] {
  const saved = readMock().orgs;
  const base = (isNewcomer() ? [] : MOCK_ORGS).map((o) => saved.find((x) => x.org_id === o.org_id) ?? o);
  return [...base, ...saved.filter((x) => !base.some((b) => b.org_id === x.org_id))];
}

export async function projects(): Promise<MyProject[]> {
  await delay();
  const orgList = allOrgs();
  return projectRows().map((r) => ({
    project_id: r.id,
    name: r.name,
    number: r.number ?? '',
    org_name: orgList.find((o) => o.org_id === r.org_id)?.name ?? '',
    role: MOCK_PROJECTS.find((p) => p.project_id === r.id)?.role ?? 'project_admin',
    stage: r.stage,
    timezone: r.timezone,
    modules: r.modules,
  }));
}

export async function project(projectId: string): Promise<ProjectRow> {
  await delay();
  const row = projectRows().find((r) => r.id === projectId);
  if (!row) throw new Error('That job no longer exists.');
  return row;
}

export async function orgs(): Promise<MyOrg[]> {
  await delay();
  return allOrgs();
}

export async function createOrg(name: string, kind: string): Promise<string> {
  await delay();
  const trimmed = name.trim();
  const same = allOrgs().find((o) => o.name.toLowerCase() === trimmed.toLowerCase());
  if (same) return same.org_id;
  const org: MyOrg = { org_id: `mock-org-${String(readMock().orgs.length + 1)}`, name: trimmed, kind, org_role: 'owner', version: 1 };
  writeMock((m) => ({ ...m, orgs: [...m.orgs, org] }));
  return org.org_id;
}

export async function createProject(v: NewJobInput): Promise<string> {
  await delay();
  const u = mockUser();
  const zone = readMock().profile?.timezone ?? mockProfile(u.id, u.email).timezone;
  const number = v.number.trim() || null;
  const same = projectRows().find(
    (r) => r.org_id === v.orgId && r.name.toLowerCase() === v.name.trim().toLowerCase() && r.number === number,
  );
  if (same) return same.id;
  const row: ProjectRow = {
    id: `mock-job-${String(readMock().projects.length + 1)}`,
    org_id: v.orgId,
    name: v.name.trim(),
    number,
    address: v.address.trim() || null,
    timezone: zone,
    stage: v.stage,
    modules: MOCK_DEFAULT_MODULES,
    settings: {},
    version: 1,
    job_type: v.jobType.trim() || null,
    prevailing_wage: v.prevailingWage,
    bid_due_at: v.bidDueAt,
    bid_sealed: false,
  };
  writeMock((m) => ({ ...m, projects: [...m.projects, row] }));
  return row.id;
}

export async function saveProject(projectId: string, patch: ProjectPatch, version: number): Promise<ProjectRow> {
  await delay();
  const current = projectRows().find((r) => r.id === projectId);
  if (!current || current.version !== version) throw conflictError();
  const next: ProjectRow = { ...current, ...patch, version: version + 1 };
  writeMock((m) => ({ ...m, projects: [...m.projects.filter((r) => r.id !== projectId), next] }));
  return next;
}

export async function saveOrg(orgId: string, patch: OrgPatch, version: number): Promise<number> {
  await delay();
  const current = allOrgs().find((o) => o.org_id === orgId);
  if (!current || current.version !== version) throw conflictError();
  const next: MyOrg = { ...current, ...patch, version: version + 1 };
  writeMock((m) => ({ ...m, orgs: [...m.orgs.filter((o) => o.org_id !== orgId), next] }));
  return next.version;
}

/** The mock user runs every company they belong to. */
export async function isOrgAdmin(orgId: string): Promise<boolean> {
  await delay();
  return allOrgs().some((o) => o.org_id === orgId);
}

/** Mock companies have bid reading on, so the e2e flows can use Read / Read all. */
export function orgSettings(): Record<string, unknown> {
  return { ai_bid_reading: true };
}
