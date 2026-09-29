// Mock request link and hub for e2e (0046): the same rules the function and RPCs apply, in short form. The mock user
// "visitor" is on no job until they join through a link; every other mock user is on the sample jobs. State lives in
// sessionStorage (its own key), like the rest of the mock.
import { FunctionError } from '../functions';
import type { HubAnswer, HubState, JoinAnswer, LinkKey, MadeHub, MadeLink, OpenAnswer, RequestLinkState } from '../requestLink.types';
import { MOCK_PROJECTS } from './fixtures';
import { mockUser } from './index';
import { delay } from './store';

const KEY = 'e2e-mock-request-link';
/** What the mock hands out as "the" tokens (43 url-safe characters, like the real ones). */
const MOCK_TOKEN = 'sample-request-token-sample-request-token-1';
const MOCK_HUB_TOKEN = 'sample-hub-token-sample-hub-token-sample-h1';
const MOCK_HUB_ID = 'mock-hub-1';
const NOT_ACTIVE = 'This link is not active. Ask the inspector for the current one.';

interface State {
  links: Record<string, string>;
  hub: string | null;
  joined: string[];
}

function read(): State {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { links: {}, hub: null, joined: [] } : (JSON.parse(raw) as State);
}

function write(update: (s: State) => State): State {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function isVisitor(): boolean {
  return mockUser().id === 'mock-user-visitor';
}

function decides(): boolean {
  return !isVisitor() && mockUser().id !== 'mock-user-bidder';
}

/** The sample jobs taking requests (Inspections on). */
function openJobs(): { project_id: string; name: string }[] {
  return MOCK_PROJECTS.filter((p) => p.modules.includes('inspections')).map((p) => ({ project_id: p.project_id, name: p.name }));
}

function jobFor(key: LinkKey): { project_id: string; name: string } {
  const ok = key.hubId === null ? key.token === MOCK_TOKEN : key.hubId === MOCK_HUB_ID && key.token === MOCK_HUB_TOKEN;
  const job = openJobs().find((j) => j.project_id === key.projectId);
  if (!ok || !job) throw new FunctionError(404, 'not_found', NOT_ACTIVE, null, null);
  return job;
}

export async function linkState(projectId: string): Promise<RequestLinkState> {
  await delay();
  const since = read().links[projectId] ?? null;
  return { active: since !== null, since };
}

export async function rotate(projectId: string): Promise<MadeLink> {
  await delay();
  const made_at = new Date().toISOString();
  write((s) => ({ ...s, links: { ...s.links, [projectId]: made_at } }));
  return { token: MOCK_TOKEN, made_at };
}

export async function undoRotate(projectId: string): Promise<void> {
  await delay();
  write((s) => ({ ...s, links: Object.fromEntries(Object.entries(s.links).filter(([id]) => id !== projectId)) }));
}

export async function hubState(): Promise<HubState> {
  await delay();
  const made_at = read().hub;
  return { decides: decides(), hub_id: made_at === null ? null : MOCK_HUB_ID, made_at, jobs: openJobs().length };
}

export async function rotateHub(): Promise<MadeHub> {
  await delay();
  if (!decides()) throw new FunctionError(403, 'forbidden', "You don't have access to that.", null, null);
  const made_at = new Date().toISOString();
  write((s) => ({ ...s, hub: made_at }));
  return { hub_id: MOCK_HUB_ID, token: MOCK_HUB_TOKEN, made_at };
}

export async function open(key: LinkKey): Promise<OpenAnswer> {
  await delay();
  const job = jobFor(key);
  const member = !isVisitor() || read().joined.includes(job.project_id);
  return { project_name: job.name, member, can_request: member };
}

export async function join(key: LinkKey): Promise<JoinAnswer> {
  await delay();
  const job = jobFor(key);
  const already = !isVisitor() || read().joined.includes(job.project_id);
  if (!already) write((s) => ({ ...s, joined: [...s.joined, job.project_id] }));
  return { project_name: job.name, status: already ? 'member' : 'added' };
}

export async function hub(hubId: string, token: string): Promise<HubAnswer> {
  await delay();
  if (hubId !== MOCK_HUB_ID || token !== MOCK_HUB_TOKEN) throw new FunctionError(404, 'not_found', NOT_ACTIVE, null, null);
  return { jobs: openJobs() };
}
