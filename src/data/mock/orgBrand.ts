// e2e mock of the letterhead and the job's brand (0110), kept in sessionStorage (never module state). The brand's logo
// is the mock company logo (mock/orgLogo). The choices: the job's company, then the companies the mock user runs.
import { conflictError } from '../errors';
import type { BrandChoice, JobBrand, Letterhead } from '../brand.types';
import * as mockJobs from './jobs';
import * as mockLogo from './orgLogo';
import { delay } from './store';

const KEY = 'e2e-mock-org-brand';

interface BrandState {
  letterheads: Record<string, Letterhead>;
  /** The job's brand when it is not the job's own company. */
  brands: Record<string, string>;
}

function readAll(): BrandState {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { letterheads: {}, brands: {} } : (JSON.parse(raw) as BrandState);
}

function writeAll(next: BrandState): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

const EMPTY: Letterhead = { version: 0, print_name: '', address: '', phone: '', website: '' };

export async function letterhead(orgId: string): Promise<Letterhead> {
  await delay();
  return readAll().letterheads[orgId] ?? EMPTY;
}

export async function saveLetterhead(orgId: string, next: Omit<Letterhead, 'version'>, version: number): Promise<Letterhead> {
  await delay();
  const all = readAll();
  const current = all.letterheads[orgId] ?? EMPTY;
  if (current.version !== version) throw conflictError();
  const row: Letterhead = { ...next, version: version + 1 };
  writeAll({ ...all, letterheads: { ...all.letterheads, [orgId]: row } });
  return row;
}

export async function choices(projectId: string): Promise<BrandChoice[]> {
  const [row, jobs, mine] = await Promise.all([mockJobs.project(projectId), mockJobs.projects(), mockJobs.orgs()]);
  const own: BrandChoice = {
    org_id: row.org_id,
    name: mine.find((o) => o.org_id === row.org_id)?.name ?? jobs.find((j) => j.project_id === projectId)?.org_name ?? '',
  };
  const others = mine
    .filter((o) => o.org_id !== row.org_id)
    .map((o) => ({ org_id: o.org_id, name: o.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [own, ...others];
}

export async function jobBrand(projectId: string): Promise<JobBrand> {
  const list = await choices(projectId);
  const id = readAll().brands[projectId] ?? list[0]?.org_id ?? '';
  const logo = await mockLogo.logo(id);
  return { orgId: id, name: list.find((c) => c.org_id === id)?.name ?? '', logoUrl: logo.url };
}

export async function setJobBrand(projectId: string, orgId: string): Promise<string> {
  const list = await choices(projectId);
  if (!list.some((c) => c.org_id === orgId)) throw new Error('Pick one of the job’s companies.');
  const all = readAll();
  const brands = Object.fromEntries(Object.entries(all.brands).filter(([id]) => id !== projectId));
  writeAll({ ...all, brands: orgId === list[0]?.org_id ? brands : { ...brands, [projectId]: orgId } });
  return orgId;
}
