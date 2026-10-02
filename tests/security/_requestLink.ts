/// <reference types="node" />
// Role probe, the request link and hub (0046, SPEC §6.4 #4): only members.manage makes the job's link; the public open
// answer is the job name plus the caller's own two facts; a member's visit changes nothing; only people who decide
// inspections have a hub, and it answers job names and ids only; rotating locks the old link out. No-login requests
// (0055, _requestNoLogin.ts): the outsider's day, a request with a photo and no session, its status link, the inspector
// sees the contact, a sub sees it anonymized, and a requester reads nothing but requests. Called by role-probe.ts with its
// seeded job and signed-in clients.
import { type Client, type Report, rowsOf } from './_lib';
import { checkNoLogin } from './_requestNoLogin';

export type RequestLinkProbeUser = 'sub' | 'inspector' | 'project_admin' | 'viewer' | 'requester';

export interface RequestLinkProbe {
  report: Report;
  service: Client;
  url: string;
  anonKey: string;
  projectId: string;
  as: (key: RequestLinkProbeUser) => Client;
}

function rows(res: { data: unknown; error: { message: string } | null }, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}

async function jwtOf(client: Client): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error(`no session: ${error ? error.message : 'signed out'}`);
  return data.session.access_token;
}

function call(p: RequestLinkProbe, body: Record<string, unknown>, jwt?: string): Promise<Response> {
  return fetch(`${p.url}/functions/v1/request-link`, {
    method: 'POST',
    headers: { apikey: p.anonKey, 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
}

const keysOf = (o: unknown): string => Object.keys(o ?? {}).sort().join(',');

export async function checkRequestLink(p: RequestLinkProbe): Promise<void> {
  const { report } = p;
  rows(await p.service.from('projects').update({ modules: ['bids', 'files', 'calendar', 'inspections'] }).eq('id', p.projectId), 'inspections on');
  const subRotate = await p.as('sub').rpc('rotate_request_link', { p_project_id: p.projectId });
  report.check('request link', 'sub cannot make the link', subRotate.error !== null);
  const rotate = async (): Promise<string> => {
    const token = rows(await p.as('project_admin').rpc('rotate_request_link', { p_project_id: p.projectId }), 'rotate_request_link')[0]?.['token'];
    if (typeof token !== 'string') throw new Error('rotate_request_link returned no token');
    return token;
  };
  const oldToken = await rotate();
  const open = { action: 'open', project_id: p.projectId, token: oldToken };

  const anon = await call(p, open);
  const anonBody: unknown = await anon.json();
  report.check('request link', 'the link opens the job (200)', anon.status === 200, `status ${anon.status}`);
  report.check('request link', 'open: name and two facts only', keysOf(anonBody) === 'can_request,member,project_name', keysOf(anonBody));
  report.check('request link', 'open without a session: not a member', (anonBody as Record<string, unknown>)['member'] === false);
  const subOpen = (await (await call(p, open, await jwtOf(p.as('sub')))).json()) as Record<string, unknown>;
  report.check('request link', 'open as a sub on the job: straight to the form', subOpen['member'] === true && subOpen['can_request'] === true);

  const join = await call(p, { action: 'join', project_id: p.projectId, token: oldToken, name: 'Probe Viewer', company: 'Probe Co' },
    await jwtOf(p.as('viewer')));
  const joined = (await join.json()) as Record<string, unknown>;
  report.check('request link', 'a member\'s visit changes nothing (member)', join.status === 200 && joined['status'] === 'member',
    `${join.status} ${JSON.stringify(joined)}`);
  const viewerId = (await p.as('viewer').auth.getUser()).data.user?.id ?? '';
  const roles = rows(await p.service.from('project_members').select('role').eq('project_id', p.projectId).eq('user_id', viewerId), 'viewer rows');
  report.check('request link', 'the viewer keeps their role (no sub row)', roles.length === 1 && roles[0]?.['role'] === 'viewer',
    JSON.stringify(roles));

  const subHub = await p.as('sub').rpc('rotate_request_hub');
  report.check('request hub', 'a sub (no ir.decide) cannot have one', subHub.error !== null);
  const hub = rows(await p.as('inspector').rpc('rotate_request_hub'), 'rotate_request_hub')[0] ?? {};
  const hubRes = await call(p, { action: 'hub', hub_id: hub['hub_id'], token: hub['token'] });
  const hubText = await hubRes.text();
  const jobs = ((JSON.parse(hubText) as { jobs?: Record<string, unknown>[] }).jobs ?? []);
  report.check('request hub', 'the hub lists the job (200)', hubRes.status === 200 && jobs.some((j) => j['project_id'] === p.projectId),
    `status ${hubRes.status}`);
  report.check('request hub', 'job names and ids only', [...new Set(jobs.map(keysOf))].join('|') === 'name,project_id',
    [...new Set(jobs.map(keysOf))].join('|'));
  report.check('request hub', 'nothing about its owner', !hubText.includes('@') && keysOf(JSON.parse(hubText)) === 'jobs', hubText.slice(0, 120));

  const newToken = await rotate();
  const [oldRes, newRes] = await Promise.all([call(p, open), call(p, { ...open, token: newToken })]);
  report.check('request link', 'rotating locks out the old link (404)', oldRes.status === 404, `status ${oldRes.status}`);
  report.check('request link', 'the new link works (200)', newRes.status === 200, `status ${newRes.status}`);
  await checkNoLogin(p, newToken);
}
