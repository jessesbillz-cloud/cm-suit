/// <reference types="node" />
// Role probe (SPEC §6.8). Seeds two projects with one user per SPEC §5.2 role (plus a second bidder, a project-B admin,
// an expired member and a revoked member) using the service role, then signs in as each user and checks: the capability
// matrix, cross-project isolation, access_ends_at, revocation, the bidder wall, pricing-only bid files, and aal2.
// Env: PROBE_SUPABASE_URL, PROBE_ANON_KEY, PROBE_SERVICE_ROLE_KEY. Exits non-zero on any failure. Cleans up even on failure.
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { type Client, Report, errText, makeClient, requireEnv, rowsOf } from './_lib';

const url = requireEnv('PROBE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = requireEnv('PROBE_ANON_KEY');
const service = makeClient(url, requireEnv('PROBE_SERVICE_ROLE_KEY'));
const report = new Report(`Role probe against ${url}`);
const RUN = randomUUID().slice(0, 8);

const ROLES = [
  'project_admin', 'estimator', 'pm', 'pe', 'superintendent', 'foreman', 'inspector', 'special_inspector',
  'bidder', 'sub', 'architect', 'owner_rep', 'viewer',
] as const;
type Role = (typeof ROLES)[number];
/** Extra users: key -> role they hold (project A unless noted). */
const EXTRA = { bidder2: 'bidder', 'admin-b': 'project_admin', expired: 'pm', revoked: 'pm' } as const;
type UserKey = Role | keyof typeof EXTRA;

/** SPEC §5.2 starting matrix, at aal1. Pricing capabilities need aal2, so nobody holds them here. */
const MATRIX: Record<string, readonly Role[]> = {
  'bids.view_pricing': [],
  'bids.view_ai_findings': [],
  'bids.manage': ['project_admin', 'estimator'],
  'bids.submit': ['bidder'],
  'dailies.read_all': ['project_admin', 'pm', 'pe', 'superintendent', 'inspector', 'owner_rep'],
  'ir.request': ['sub', 'superintendent', 'foreman', 'pe', 'project_admin'],
  'ir.decide': ['inspector'],
  'deliveries.manage': ['superintendent', 'pm', 'project_admin'],
  'corrections.close': ['inspector'],
  'rfi.create_draft': ['sub', 'superintendent', 'foreman', 'pe', 'pm', 'project_admin'],
  'rfi.sign_issue': ['pm', 'pe', 'project_admin'],
  'rfi.answer': ['architect'],
  'rfi.view_internal_research': ['project_admin', 'pm', 'pe', 'estimator'],
  'members.manage': ['project_admin'],
};

interface ProbeUser {
  id: string;
  email: string;
  password: string;
}
interface Seed {
  users: Map<UserKey, ProbeUser>;
  projA: string;
  projB: string;
  bidsFolder: string;
  bidFile1: string;
  bidFile2: string;
  bidder2Activity: string;
}

type Res = { data: unknown; error: { message: string } | null };
function must(res: Res, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}
function str(row: Record<string, unknown> | undefined, key: string): string {
  const v = row?.[key];
  if (typeof v !== 'string') throw new Error(`expected string ${key}, got ${JSON.stringify(v)}`);
  return v;
}
function user(seed: Seed, key: UserKey): ProbeUser {
  const u = seed.users.get(key);
  if (!u) throw new Error(`user ${key} was not seeded`);
  return u;
}

// ---------------------------------------------------------------------------------------------------------------
// Seeding (service role)
// ---------------------------------------------------------------------------------------------------------------
async function existingProbeUsers(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (u.email?.startsWith('probe+')) found.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  return found;
}

async function ensureUsers(): Promise<Map<UserKey, ProbeUser>> {
  const existing = await existingProbeUsers();
  const users = new Map<UserKey, ProbeUser>();
  const keys: UserKey[] = [...ROLES, ...(Object.keys(EXTRA) as (keyof typeof EXTRA)[])];
  for (const key of keys) {
    const email = `probe+${key}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const known = existing.get(email);
    if (known) {
      const { error } = await service.auth.admin.updateUserById(known, { password, email_confirm: true });
      if (error) throw new Error(`updateUser ${email}: ${error.message}`);
      users.set(key, { id: known, email, password });
    } else {
      const { data, error } = await service.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: `Probe ${key}` },
      });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
      users.set(key, { id: data.user.id, email, password });
    }
  }
  // Leftovers from an interrupted run must not keep access anywhere.
  const ids = [...users.values()].map((u) => u.id);
  must(await service.from('project_members').update({ status: 'revoked' }).in('user_id', ids).neq('status', 'revoked'), 'revoke leftovers');
  return users;
}

async function seed(users: Map<UserKey, ProbeUser>, created: { projects: string[] }): Promise<Seed> {
  const s = { users } as Seed;
  const adminA = user(s, 'project_admin').id;
  const adminB = user(s, 'admin-b').id;
  const orgs = must(await service.from('orgs').insert([
    { name: `Probe org A ${RUN}`, kind: 'gc', created_by: adminA },
    { name: `Probe org B ${RUN}`, kind: 'gc', created_by: adminB },
  ]).select('id, created_by'), 'insert orgs');
  const orgA = str(orgs.find((o) => o['created_by'] === adminA), 'id');
  const orgB = str(orgs.find((o) => o['created_by'] === adminB), 'id');
  // Creators become project_admin and default folders appear (triggers).
  const projects = must(await service.from('projects').insert([
    { org_id: orgA, name: `Probe A ${RUN}`, created_by: adminA },
    { org_id: orgB, name: `Probe B ${RUN}`, created_by: adminB },
  ]).select('id, org_id'), 'insert projects');
  s.projA = str(projects.find((p) => p['org_id'] === orgA), 'id');
  s.projB = str(projects.find((p) => p['org_id'] === orgB), 'id');
  created.projects.push(s.projA, s.projB);

  const past = new Date(Date.now() - 60_000).toISOString();
  const members: Record<string, unknown>[] = [];
  const memberKeys: UserKey[] = [...ROLES.filter((r) => r !== 'project_admin'), 'bidder2', 'expired', 'revoked'];
  for (const key of memberKeys) {
    const u = user(s, key);
    const role = key in EXTRA ? EXTRA[key as keyof typeof EXTRA] : key;
    members.push({
      org_id: orgA, project_id: s.projA, user_id: u.id, invite_email: u.email, role,
      status: key === 'revoked' ? 'revoked' : 'active',
      access_ends_at: key === 'expired' ? past : null,
      created_by: adminA,
    });
  }
  must(await service.from('project_members').insert(members), 'insert members');

  s.bidsFolder = str(must(await service.from('folders').select('id').eq('project_id', s.projA).eq('kind', 'bids_received'), 'bids folder')[0], 'id');
  const bFolder = str(must(await service.from('folders').select('id').eq('project_id', s.projB).eq('kind', 'plans'), 'B folder')[0], 'id');
  s.bidFile1 = randomUUID();
  s.bidFile2 = randomUUID();
  const bFile = randomUUID();
  const file = (id: string, org: string, proj: string, folder: string, by: string, name: string) => ({
    id, org_id: org, project_id: proj, folder_id: folder, original_name: name, created_by: by, scan_status: 'clean',
    storage_path: `project/${proj}/${folder}/${id}/${name}`,
  });
  must(await service.from('files').insert([
    file(s.bidFile1, orgA, s.projA, s.bidsFolder, user(s, 'bidder').id, 'bid-1.pdf'),
    file(s.bidFile2, orgA, s.projA, s.bidsFolder, user(s, 'bidder2').id, 'bid-2.pdf'),
    file(bFile, orgB, s.projB, bFolder, adminB, 'b-only.pdf'),
  ]), 'insert files');

  const acts = must(await service.from('activity').insert([
    { org_id: orgA, project_id: s.projA, kind: 'probe', summary: 'For bidder 2 only' },
    { org_id: orgB, project_id: s.projB, kind: 'probe', summary: 'Project B news', audience_capability: 'files.read_project' },
  ]).select('id, project_id'), 'insert activity');
  s.bidder2Activity = str(acts.find((a) => a['project_id'] === s.projA), 'id');
  must(await service.from('activity_recipients').insert({ activity_id: s.bidder2Activity, user_id: user(s, 'bidder2').id }), 'insert recipient');
  return s;
}

async function signIn(u: ProbeUser): Promise<Client> {
  const c = makeClient(url, anonKey);
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`sign in ${u.email}: ${error.message}`);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// Checks (as each user)
// ---------------------------------------------------------------------------------------------------------------
async function hasCap(c: Client, project: string, cap: string): Promise<boolean> {
  const res = await c.rpc('has_capability', { p_project_id: project, p_cap: cap });
  if (res.error) throw new Error(`has_capability(${cap}): ${res.error.message}`);
  return res.data === true;
}
async function count(c: Client, table: string, col: string, val: string): Promise<number> {
  return must(await c.from(table).select('*').eq(col, val), `${table} select`).length;
}
async function myProjects(c: Client): Promise<string[]> {
  return must(await c.rpc('my_projects'), 'my_projects').map((r) => str(r, 'project_id'));
}

async function checkMatrix(s: Seed, clients: Map<UserKey, Client>): Promise<void> {
  const got = new Map<string, Set<Role>>();
  await Promise.all(ROLES.map(async (role) => {
    const c = clients.get(role);
    if (!c) throw new Error(`no client for ${role}`);
    for (const cap of Object.keys(MATRIX)) {
      if (await hasCap(c, s.projA, cap)) {
        const set = got.get(cap) ?? new Set<Role>();
        set.add(role);
        got.set(cap, set);
      }
    }
  }));
  for (const [cap, want] of Object.entries(MATRIX)) {
    const have = got.get(cap) ?? new Set<Role>();
    const extra = [...have].filter((r) => !want.includes(r));
    const missing = want.filter((r) => !have.has(r));
    const detail = extra.length || missing.length ? `extra: [${extra.join(', ')}] missing: [${missing.join(', ')}]` : `[${want.join(', ')}]`;
    report.check('matrix', cap, extra.length === 0 && missing.length === 0, detail);
  }
}

async function checkIsolation(s: Seed, c: Client, who: string): Promise<void> {
  for (const [table, col] of [['projects', 'id'], ['project_members', 'project_id'], ['folders', 'project_id'], ['files', 'project_id'], ['activity', 'project_id']] as const) {
    await report.guard('isolation', `${who}: ${table}`, async () => {
      const n = await count(c, table, col, s.projB);
      report.check('isolation', `${who}: sees no project B ${table}`, n === 0, `${n} rows`);
    });
  }
  await report.guard('isolation', `${who}: my_projects`, async () => {
    const ids = await myProjects(c);
    report.check('isolation', `${who}: my_projects has A, not B`, ids.includes(s.projA) && !ids.includes(s.projB), ids.join(', '));
  });
}

async function checkLockedOut(s: Seed, c: Client, who: string): Promise<void> {
  await report.guard('lockout', who, async () => {
    report.check('lockout', `${who}: has_capability false`, !(await hasCap(c, s.projA, 'dailies.read_all')));
    const ids = await myProjects(c);
    report.check('lockout', `${who}: my_projects excludes A`, !ids.includes(s.projA), ids.join(', '));
    const n = await count(c, 'projects', 'id', s.projA);
    report.check('lockout', `${who}: project A row hidden`, n === 0, `${n} rows`);
  });
}

async function checkBidderWall(s: Seed, clients: Map<UserKey, Client>): Promise<void> {
  const b1 = user(s, 'bidder');
  const b2 = user(s, 'bidder2');
  const pairs: [UserKey, ProbeUser, ProbeUser, string, string][] = [
    ['bidder', b1, b2, s.bidFile1, s.bidFile2],
    ['bidder2', b2, b1, s.bidFile2, s.bidFile1],
  ];
  for (const [key, me, other, mine, theirs] of pairs) {
    const c = clients.get(key);
    if (!c) throw new Error(`no client for ${key}`);
    await report.guard('bidder wall', key, async () => {
      const members = must(await c.from('project_members').select('user_id').eq('project_id', s.projA), 'members');
      report.check('bidder wall', `${key}: project_members = own row only`,
        members.length === 1 && members[0]?.['user_id'] === me.id, `${members.length} rows`);
      const people = must(await c.rpc('people_display', { p_project_id: s.projA }), 'people_display');
      report.check('bidder wall', `${key}: people_display = self only`,
        people.length === 1 && people[0]?.['user_id'] === me.id, `${people.length} rows`);
      report.check('bidder wall', `${key}: other bidder absent from people_display`, !people.some((p) => p['user_id'] === other.id));
      const files = must(await c.from('files').select('id').eq('folder_id', s.bidsFolder), 'files');
      report.check('bidder wall', `${key}: Bids received shows only own file`,
        files.length === 1 && files[0]?.['id'] === mine && !files.some((f) => f['id'] === theirs), `${files.length} rows`);
      const profiles = await count(c, 'profiles', 'user_id', other.id);
      report.check('bidder wall', `${key}: other bidder's profile hidden`, profiles === 0, `${profiles} rows`);
    });
  }
  await report.guard('bidder wall', 'activity', async () => {
    const c = clients.get('bidder');
    if (!c) throw new Error('no client for bidder');
    const n = await count(c, 'activity', 'id', s.bidder2Activity);
    report.check('bidder wall', 'bidder: activity addressed to bidder2 hidden', n === 0, `${n} rows`);
  });
  await report.guard('bidder wall', 'estimator', async () => {
    const c = clients.get('estimator');
    if (!c) throw new Error('no client for estimator');
    const rows = must(await c.from('project_members').select('user_id').eq('project_id', s.projA).eq('role', 'bidder'), 'members');
    const ids = rows.map((r) => r['user_id']);
    report.check('bidder wall', 'estimator (bids.manage) sees both bidders', ids.includes(b1.id) && ids.includes(b2.id), `${ids.length} rows`);
  });
  await report.guard('bidder wall', 'pm', async () => {
    const c = clients.get('pm');
    if (!c) throw new Error('no client for pm');
    const n = must(await c.from('project_members').select('id').eq('project_id', s.projA).eq('role', 'bidder'), 'members').length;
    report.check('bidder wall', 'pm (members.view only) sees no bidders', n === 0, `${n} rows`);
  });
  report.todo('bidder wall', 'prices, questions, submissions (bid tables)', 'Phase 1 adds bid_pricing / bid_questions; extend here');
}

async function checkPricing(s: Seed, clients: Map<UserKey, Client>): Promise<void> {
  // At aal1 nobody may read received bid files except the uploading bidder (checked above).
  for (const role of ROLES.filter((r) => r !== 'bidder')) {
    const c = clients.get(role);
    if (!c) throw new Error(`no client for ${role}`);
    await report.guard('money', role, async () => {
      const n = await count(c, 'files', 'folder_id', s.bidsFolder);
      report.check('money', `${role} (aal1): no files in Bids received`, n === 0, `${n} rows`);
    });
  }
  for (const role of ['project_admin', 'estimator'] as const) {
    const c = clients.get(role);
    if (!c) throw new Error(`no client for ${role}`);
    await report.guard('aal2', role, async () => {
      const res = await c.rpc('session_aal');
      if (res.error) throw new Error(res.error.message);
      const aal: unknown = res.data;
      report.check('aal2', `${role}: password session is aal1`, aal === 'aal1', String(aal));
      report.check('aal2', `${role}: bids.view_pricing denied without aal2`, !(await hasCap(c, s.projA, 'bids.view_pricing')));
    });
  }
  report.todo('money', 'pricing tables (bid_pricing, bid_extraction_pricing, estimate_exports)', 'Phase 1 creates them; add aal2 TOTP sign-in');
  report.todo('requests', 'requesters see only anonymized fields of others\' requests', 'Phase 3 (inspection requests)');
}

// ---------------------------------------------------------------------------------------------------------------
// Cleanup: runs even when seeding or checks fail.
// ---------------------------------------------------------------------------------------------------------------
async function cleanup(users: Map<UserKey, ProbeUser> | null, projects: string[]): Promise<void> {
  if (projects.length) {
    await report.guard('cleanup', 'projects', async () => {
      must(await service.from('project_members').update({ status: 'revoked' }).in('project_id', projects).neq('status', 'revoked'), 'revoke members');
      must(await service.from('projects').update({ deleted_at: new Date().toISOString() }).in('id', projects), 'soft-delete projects');
    });
  }
  for (const [key, u] of users ?? []) {
    const hard = await service.auth.admin.deleteUser(u.id);
    if (!hard.error) continue;
    // Seeded rows reference the user (no cascade, hard deletes blocked); a soft delete still frees the account.
    const soft = await service.auth.admin.deleteUser(u.id, true);
    report.check('cleanup', `delete ${key}`, !soft.error, soft.error ? `${hard.error.message}; soft: ${soft.error.message}` : 'soft-deleted');
  }
}

async function main(): Promise<void> {
  let users: Map<UserKey, ProbeUser> | null = null;
  const created = { projects: [] as string[] };
  try {
    users = await ensureUsers();
    const s = await seed(users, created);
    const clients = new Map<UserKey, Client>();
    for (const [key, u] of users) clients.set(key, await signIn(u));
    const get = (k: UserKey): Client => {
      const c = clients.get(k);
      if (!c) throw new Error(`no client for ${k}`);
      return c;
    };
    await report.guard('matrix', 'capability matrix', () => checkMatrix(s, clients));
    await checkIsolation(s, get('pm'), 'pm (A)');
    await checkIsolation(s, get('project_admin'), 'org A owner');
    await checkLockedOut(s, get('expired'), 'access_ends_at passed');
    await checkLockedOut(s, get('revoked'), 'revoked');
    await report.guard('bidder wall', 'bidder wall', () => checkBidderWall(s, clients));
    await report.guard('money', 'pricing', () => checkPricing(s, clients));
  } catch (e) {
    report.check('probe', 'seed and sign in', false, errText(e));
  } finally {
    await cleanup(users, created.projects).catch((e: unknown) => {
      report.check('cleanup', 'cleanup ran', false, errText(e));
    });
    report.finish();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`role probe crashed: ${errText(e)}\n`);
  process.exitCode = 1;
});
