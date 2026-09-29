// `deno test supabase/functions/_shared/requestLink_test.ts` — the request link's request and answer whitelist.
import { hubAnswer, joinAnswer, openAnswer, RequestLinkBody } from './requestLink.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const TOKEN = 'A'.repeat(43);
const PROJECT = '00000000-0000-4000-8000-000000000001';
const HUB = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-000000000003';

Deno.test('open answer: the job name and the caller\'s own two facts, nothing else', () => {
  const out = openAnswer({ project_name: 'Sample Job', org_id: PROJECT, timezone: 'America/Los_Angeles', email: 'x@example.test' }, true, true);
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['can_request', 'member', 'project_name']), 'keys');
  check(out.member && out.can_request && out.project_name === 'Sample Job', 'values');
  check(!openAnswer({ project_name: 'Sample Job' }, false, true).can_request, 'no request form for a non-member');
});

Deno.test('join answer: name and status only; an unknown status fails loudly', () => {
  const out = joinAnswer({ project_name: 'Sample Job', status: 'added', member_id: PROJECT, invite_email: 'x@example.test' });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['project_name', 'status']), 'keys');
  let threw = false;
  try {
    joinAnswer({ project_name: 'Sample Job', status: 'owner' });
  } catch {
    threw = true;
  }
  check(threw, 'status is added | member');
});

Deno.test('hub answer: job names and ids only, nothing about the owner', () => {
  const out = hubAnswer({
    owner: USER,
    owner_email: 'x@example.test',
    jobs: [{ project_id: PROJECT, name: 'Sample Job', address: '1 Sample St', request_token_hash: 'f'.repeat(64) }],
  });
  check(JSON.stringify(Object.keys(out)) === JSON.stringify(['jobs']), 'top-level keys');
  check(JSON.stringify(Object.keys(out.jobs[0] ?? {}).sort()) === JSON.stringify(['name', 'project_id']), 'job keys');
  const text = JSON.stringify(out);
  check(!text.includes(USER) && !text.includes('@') && !text.includes('fff'), 'no owner, no email, no hash');
});

Deno.test('request: each action is strict and bounded', () => {
  check(RequestLinkBody.safeParse({ action: 'open', project_id: PROJECT, token: TOKEN }).success, 'open with the job token');
  check(RequestLinkBody.safeParse({ action: 'open', project_id: PROJECT, token: TOKEN, hub_id: HUB }).success, 'open with a hub token');
  const join = RequestLinkBody.safeParse({ action: 'join', project_id: PROJECT, token: TOKEN, name: ' Sample Sub ', company: 'Sample Co' });
  check(join.success && join.data.action === 'join' && join.data.name === 'Sample Sub', 'join, trimmed');
  check(RequestLinkBody.safeParse({ action: 'hub', hub_id: HUB, token: TOKEN }).success, 'hub');
  const bad = [
    { action: 'open', project_id: PROJECT, token: 'short' },
    { action: 'open', project_id: 'not-a-uuid', token: TOKEN },
    // The address comes from the session, never the body.
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A', company: 'B', email: 'x@example.test' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: '   ', company: 'B' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A'.repeat(121), company: 'B' },
    { action: 'join', project_id: PROJECT, token: TOKEN, name: 'A', company: 'B', role: 'pm' },
    { action: 'hub', token: TOKEN },
    { action: 'rotate', project_id: PROJECT, token: TOKEN },
  ];
  for (const b of bad) check(!RequestLinkBody.safeParse(b).success, `refused: ${JSON.stringify(b)}`);
});
