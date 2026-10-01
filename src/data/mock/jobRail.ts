// My tools under each job's name in the e2e mock (0051), with the database's rules: only on a job I'm on, known job
// tools each once (lib/jobs JOB_TOOLS mirrors job_rail_tools()), a version check, null = the recommendation. State lives
// in sessionStorage, never module state.
import { JOB_TOOLS } from '../../lib/jobs';
import { DataError, conflictError } from '../errors';
import { projects } from './jobs';
import { delay } from './store';

type Rows = Record<string, { tools: string[] | null; version: number }>;

const KEY = 'e2e-mock-job-rail';

function read(): Rows {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Rows);
}

function write(rows: Rows): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(rows));
}

async function onJob(projectId: string): Promise<boolean> {
  return (await projects()).some((p) => p.project_id === projectId);
}

export async function jobRails(): Promise<{ project_id: string; tools: string[] | null; version: number }[]> {
  await delay();
  const mine = new Set((await projects()).map((p) => p.project_id));
  return Object.entries(read())
    .filter(([id]) => mine.has(id))
    .map(([project_id, r]) => ({ project_id, ...r }));
}

export async function saveJobRail(projectId: string, tools: string[] | null, version: number | null): Promise<number> {
  await delay();
  if (!(await onJob(projectId))) throw new DataError("You don't have access to that.", '42501', 'forbidden');
  const known: readonly string[] = JOB_TOOLS;
  if (tools !== null && (new Set(tools).size !== tools.length || tools.some((t) => !known.includes(t)))) {
    throw new DataError("Pick from the job's tools, each once.", '22023', null);
  }
  const rows = read();
  if ((rows[projectId]?.version ?? null) !== version) throw conflictError();
  const next = (version ?? 0) + 1;
  write({ ...rows, [projectId]: { tools, version: next } });
  return next;
}
