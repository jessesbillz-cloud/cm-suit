// The rail in the e2e mock (0040): recommendations by the mock user's role (the database keeps them in
// roles.recommended_tools) minus each job's switched-off tools, and what needs the mock user per record type from the
// mock tasks and waiting RFIs, each record once, as my_recommended_tools / my_tool_counts answer.
import type { TypeCount } from '../../lib/toolCounts';
import { tasks } from './api';
import { projects } from './jobs';
import { me, waiting } from './rfis';
import { myOpenMeetings } from './safety';

/** Synthetic copy of the starting table for the roles the mock users take. */
const RECOMMENDED: Record<string, readonly string[]> = {
  project_admin: ['board', 'calendar', 'bids', 'rfis', 'inspections', 'files', 'hours'],
  pm: ['board', 'calendar', 'rfis', 'inspections', 'files'],
  inspector: ['board', 'calendar', 'dailies', 'inspections', 'revs', 'corrections', 'files', 'hours'],
  inspector_admin: ['board', 'calendar', 'dailies', 'inspections', 'revs', 'corrections', 'files', 'hours'],
  sub: ['board', 'calendar', 'inspections', 'rfis', 'files'],
  architect: ['board', 'rfis', 'files'],
  bidder: ['bids'],
  ahj: ['board', 'calendar', 'permits', 'inspections', 'revs', 'files'],
  superintendent: ['board', 'calendar', 'dailies', 'safety', 'inspections', 'deliveries'],
  safety: ['board', 'safety', 'calendar'],
  foreman: ['board', 'calendar', 'dailies', 'safety', 'inspections', 'deliveries'],
};

const ALWAYS_ON = ['board', 'people'];

export async function recommendedTools(): Promise<{ project_id: string; tools: string[] }[]> {
  const mine = me().role;
  return (await projects()).map((p) => {
    const role = mine in RECOMMENDED ? mine : p.role;
    const list = RECOMMENDED[role] ?? [];
    return { project_id: p.project_id, tools: list.filter((t) => ALWAYS_ON.includes(t) || p.modules.includes(t)) };
  });
}

export async function toolCounts(projectId: string | null): Promise<TypeCount[]> {
  const records = new Map<string | null, Set<string>>();
  const add = (type: string | null, id: string) => {
    records.set(type, (records.get(type) ?? new Set<string>()).add(id));
  };
  for (const t of await tasks(projectId)) add(t.entity_type, t.entity_id ?? t.id);
  for (const w of await waiting()) if (projectId === null || w.project_id === projectId) add('rfi', w.id);
  for (const id of myOpenMeetings(projectId)) add('safety_meeting', id);
  return [...records].map(([entity_type, ids]) => ({ entity_type, n: ids.size }));
}
