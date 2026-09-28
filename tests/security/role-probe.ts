/// <reference types="node" />
// Role probe (SPEC §6.8). Seeds two projects with one user per SPEC §5.2 role (plus a second bidder, a project-B admin,
// an expired member and a revoked member) using the service role, then signs in as each user and checks: the capability
// matrix, cross-project isolation, access_ends_at, revocation, the bidder wall (members, people, files, invites,
// submissions, questions, bidder_page), the sealed-bid hold, pricing-only bid files and money tables, and aal2.
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
  'dailies.write': ['project_admin', 'pm', 'pe', 'superintendent', 'foreman', 'inspector', 'special_inspector'],
  'ir.request': ['sub', 'superintendent', 'foreman', 'pe', 'project_admin'],
  'ir.decide': ['inspector'],
  'ir.gc_approve': ['project_admin', 'pm', 'superintendent'],
  'ir.view_all': ['project_admin', 'pm', 'pe', 'superintendent', 'inspector', 'owner_rep'],
  'deliveries.manage': ['superintendent', 'pm', 'project_admin'],
  'corrections.close': ['inspector'],
  'rfi.create_draft': ['sub', 'superintendent', 'foreman', 'pe', 'pm', 'project_admin'],
  'rfi.sign_issue': ['pm', 'pe', 'project_admin'],
  'rfi.answer': ['architect'],
  'rfi.view_internal_research': ['project_admin', 'pm', 'pe', 'estimator'],
  'members.manage': ['project_admin'],
  'deliveries.view': ROLES.filter((r) => r !== 'bidder'),
  'deliveries.post': ['project_admin', 'pm', 'pe', 'superintendent', 'foreman', 'sub'],
  'corrections.view': ['project_admin', 'pm', 'pe', 'superintendent', 'foreman', 'inspector', 'special_inspector', 'sub', 'architect', 'owner_rep', 'viewer'],
  'corrections.create': ['project_admin', 'pm', 'pe', 'superintendent', 'inspector'],
  'corrections.mark_ready': ['project_admin', 'pm', 'pe', 'superintendent', 'foreman', 'sub'],
};

interface ProbeUser {
  id: string;
  email: string;
  password: string;
}
interface Seed {
  users: Map<UserKey, ProbeUser>;
  orgA: string;
  projA: string;
  projB: string;
  bidsFolder: string;
  pkg: string;
  bidder2Activity: string;
}
type Bidder = 'bidder' | 'bidder2';
const BIDDERS: readonly Bidder[] = ['bidder', 'bidder2'];
/** What each bidder created through the RPCs (as itself, not the service role). */
interface Bid {
  file: string;
  submission: string;
  question: string;
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
function clientOf(clients: Map<UserKey, Client>, key: UserKey): Client {
  const c = clients.get(key);
  if (!c) throw new Error(`no client for ${key}`);
  return c;
}
function bidOf(bids: Map<Bidder, Bid>, key: Bidder): Bid {
  const b = bids.get(key);
  if (!b) throw new Error(`no bid for ${key}`);
  return b;
}
async function rpcRow(c: Client, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const row = must(await c.rpc(fn, args), fn)[0];
  if (!row) throw new Error(`${fn} returned nothing`);
  return row;
}
async function idsIn(c: Client, table: string, col: string, projectId: string): Promise<unknown[]> {
  return must(await c.from(table).select(col).eq('project_id', projectId), `${table} select`).map((r) => r[col]);
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
  s.orgA = orgA;
  // Creators become project_admin and default folders appear (triggers). Project A is sealed, due tomorrow.
  const due = new Date(Date.now() + 86_400_000).toISOString();
  const projects = must(await service.from('projects').insert([
    { org_id: orgA, name: `Probe A ${RUN}`, created_by: adminA, bid_due_at: due, bid_sealed: true },
    // Same keys as A: a bulk insert fills a missing key with null, not the column default.
    { org_id: orgB, name: `Probe B ${RUN}`, created_by: adminB, bid_due_at: null, bid_sealed: false },
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
  const inserted = must(await service.from('project_members').insert(members).select('id, user_id'), 'insert members');

  // One package; both bidders are scoped to it and invited (as invite-bidders would, with the service role).
  s.pkg = str(must(await service.from('bid_packages').insert({
    org_id: orgA, project_id: s.projA, code: '23A', name: `Probe package ${RUN}`, created_by: user(s, 'estimator').id,
  }).select('id'), 'insert package')[0], 'id');
  const bidderMembers = BIDDERS.map((k) => str(inserted.find((m) => m['user_id'] === user(s, k).id), 'id'));
  must(await service.from('member_scopes').insert(bidderMembers.map((m) => ({ project_member_id: m, scope_type: 'bid_package', scope_id: s.pkg }))), 'insert scopes');
  must(await service.from('bid_invites').insert(bidderMembers.map((m) => ({
    org_id: orgA, project_id: s.projA, package_id: s.pkg, member_id: m, created_by: user(s, 'estimator').id,
  }))), 'insert invites');

  s.bidsFolder = str(must(await service.from('folders').select('id').eq('project_id', s.projA).eq('kind', 'bids_received'), 'bids folder')[0], 'id');
  const bFolder = str(must(await service.from('folders').select('id').eq('project_id', s.projB).eq('kind', 'plans'), 'B folder')[0], 'id');
  const bFile = randomUUID();
  const file = (id: string, org: string, proj: string, folder: string, by: string, name: string) => ({
    id, org_id: org, project_id: proj, folder_id: folder, original_name: name, created_by: by, scan_status: 'clean',
    storage_path: `project/${proj}/${folder}/${id}/${name}`,
  });
  must(await service.from('files').insert(file(bFile, orgB, s.projB, bFolder, adminB, 'b-only.pdf')), 'insert files');

  const acts = must(await service.from('activity').insert([
    { org_id: orgA, project_id: s.projA, kind: 'probe', summary: 'For bidder 2 only' },
    { org_id: orgB, project_id: s.projB, kind: 'probe', summary: 'Project B news', audience_capability: 'files.read_project' },
  ]).select('id, project_id'), 'insert activity');
  s.bidder2Activity = str(acts.find((a) => a['project_id'] === s.projA), 'id');
  must(await service.from('activity_recipients').insert({ activity_id: s.bidder2Activity, user_id: user(s, 'bidder2').id }), 'insert recipient');
  return s;
}

// Each bidder registers its file and submits through the RPCs with its own session (no storage upload needed);
// the extraction drafts with money are written the way the worker writes them (service role).
async function seedBids(s: Seed, clients: Map<UserKey, Client>): Promise<Map<Bidder, Bid>> {
  const bids = new Map<Bidder, Bid>();
  for (const key of BIDDERS) {
    const c = clientOf(clients, key);
    const file = str(await rpcRow(c, 'register_file', {
      p_folder_id: s.bidsFolder, p_original_name: `bid-${key}.pdf`, p_mime: 'application/pdf', p_size: 100,
    }), 'id');
    const submission = str(await rpcRow(c, 'submit_bid', { p_package_id: s.pkg, p_file_id: file }), 'id');
    const question = str(await rpcRow(c, 'ask_bid_question', { p_project_id: s.projA, p_package_id: s.pkg, p_question: `Probe question ${key}` }), 'id');
    bids.set(key, { file, submission, question });
  }
  const ex = must(await service.from('bid_extractions').insert(
    [...bids.values()].map((b) => ({ org_id: s.orgA, project_id: s.projA, submission_id: b.submission })),
  ).select('id'), 'insert extractions');
  must(await service.from('bid_extraction_pricing').insert(
    ex.map((e, i) => ({ extraction_id: str(e, 'id'), project_id: s.projA, base_amount: 100_000 + i })),
  ), 'insert pricing');
  return bids;
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
  for (const [table, col] of [['projects', 'id'], ['project_members', 'project_id'], ['folders', 'project_id'], ['files', 'project_id'], ['activity', 'project_id'],
    ['daily_reports', 'project_id']] as const) {
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

async function checkBidderWall(s: Seed, clients: Map<UserKey, Client>, bids: Map<Bidder, Bid>): Promise<void> {
  for (const key of BIDDERS) {
    const otherKey: Bidder = key === 'bidder' ? 'bidder2' : 'bidder';
    const me = user(s, key);
    const other = user(s, otherKey);
    const mine = bidOf(bids, key);
    const theirs = bidOf(bids, otherKey);
    const c = clientOf(clients, key);
    await report.guard('bidder wall', key, async () => {
      const members = must(await c.from('project_members').select('user_id').eq('project_id', s.projA), 'members');
      report.check('bidder wall', `${key}: project_members = own row only`,
        members.length === 1 && members[0]?.['user_id'] === me.id, `${members.length} rows`);
      const people = must(await c.rpc('people_display', { p_project_id: s.projA }), 'people_display');
      report.check('bidder wall', `${key}: people_display = self only`,
        people.length === 1 && people[0]?.['user_id'] === me.id, `${people.length} rows`);
      report.check('bidder wall', `${key}: other bidder absent from people_display`, !people.some((p) => p['user_id'] === other.id));
      const files = must(await c.from('files').select('id').eq('folder_id', s.bidsFolder), 'files').map((f) => f['id']);
      report.check('bidder wall', `${key}: Bids received shows only own file`,
        files.length === 1 && files[0] === mine.file && !files.includes(theirs.file), `${files.length} rows`);
      const profiles = await count(c, 'profiles', 'user_id', other.id);
      report.check('bidder wall', `${key}: other bidder's profile hidden`, profiles === 0, `${profiles} rows`);
      const subs = await idsIn(c, 'bid_submissions', 'id', s.projA);
      report.check('bidder wall', `${key}: own submission visible`, subs.includes(mine.submission), `${subs.length} rows`);
      report.check('bidder wall', `${key}: other bidder's submission hidden`, !subs.includes(theirs.submission), `${subs.length} rows`);
      const qs = await idsIn(c, 'bid_questions', 'id', s.projA);
      report.check('bidder wall', `${key}: bid_questions = own only`, qs.length === 1 && qs[0] === mine.question, `${qs.length} rows`);
      const invites = await idsIn(c, 'bid_invites', 'id', s.projA);
      report.check('bidder wall', `${key}: bid_invites = own only`, invites.length === 1, `${invites.length} rows`);
      const priced = (await idsIn(c, 'bid_extraction_pricing', 'extraction_id', s.projA)).length
        + (await idsIn(c, 'bid_extractions', 'id', s.projA)).length;
      report.check('bidder wall', `${key}: no extraction or pricing rows (even its own)`, priced === 0, `${priced} rows`);

      const page = await c.rpc('bidder_page', { p_project_id: s.projA });
      if (page.error) throw new Error(`bidder_page: ${page.error.message}`);
      const data = page.data as { packages?: { submissions?: { id?: unknown }[] }[] } | null;
      const pageSubs = (data?.packages ?? []).flatMap((p) => p.submissions ?? []).map((x) => x.id);
      report.check('bidder wall', `${key}: bidder_page submissions = own only`,
        pageSubs.length === 1 && pageSubs[0] === mine.submission, `${pageSubs.length} submissions`);
      const text = JSON.stringify(page.data);
      const leaks = [theirs.submission, theirs.file, theirs.question, other.id, other.email].filter((v) => text.includes(v));
      report.check('bidder wall', `${key}: bidder_page never mentions the other bidder`, leaks.length === 0, leaks.join(', '));
    });
  }
  await report.guard('bidder wall', 'activity', async () => {
    const n = await count(clientOf(clients, 'bidder'), 'activity', 'id', s.bidder2Activity);
    report.check('bidder wall', 'bidder: activity addressed to bidder2 hidden', n === 0, `${n} rows`);
  });
  await report.guard('bidder wall', 'estimator', async () => {
    const c = clientOf(clients, 'estimator');
    const rows = must(await c.from('project_members').select('user_id').eq('project_id', s.projA).eq('role', 'bidder'), 'members');
    const got = rows.map((r) => r['user_id']);
    report.check('bidder wall', 'estimator (bids.manage) sees both bidders',
      got.includes(user(s, 'bidder').id) && got.includes(user(s, 'bidder2').id), `${got.length} rows`);
    const qs = await idsIn(c, 'bid_questions', 'id', s.projA);
    report.check('bidder wall', 'estimator (bids.manage) sees both questions',
      BIDDERS.every((k) => qs.includes(bidOf(bids, k).question)), `${qs.length} rows`);
  });
  await report.guard('bidder wall', 'pm', async () => {
    const c = clientOf(clients, 'pm');
    const n = must(await c.from('project_members').select('id').eq('project_id', s.projA).eq('role', 'bidder'), 'members').length;
    report.check('bidder wall', 'pm (members.view only) sees no bidders', n === 0, `${n} rows`);
    const subs = (await idsIn(c, 'bid_submissions', 'id', s.projA)).length + (await idsIn(c, 'bid_questions', 'id', s.projA)).length;
    report.check('bidder wall', 'pm (no bids.manage) sees no submissions or questions', subs === 0, `${subs} rows`);
  });
}

// Sealed until bid time (SPEC §11.4): the project side opens nothing; unsealing opens submissions, never money at aal1.
async function checkSealed(s: Seed, clients: Map<UserKey, Client>, bids: Map<Bidder, Bid>): Promise<void> {
  const est = clientOf(clients, 'estimator');
  const want = [...bids.values()].map((b) => b.submission);
  const pricingRows = async (c: Client) => (await idsIn(c, 'bid_extraction_pricing', 'extraction_id', s.projA)).length;
  let got = await idsIn(est, 'bid_submissions', 'id', s.projA);
  report.check('sealed', 'estimator (aal1): 0 submissions while sealed', got.length === 0, `${got.length} rows`);
  let n = await pricingRows(est);
  report.check('money', 'estimator (aal1): no bid_extraction_pricing while sealed', n === 0, `${n} rows`);

  must(await service.from('projects').update({ bid_sealed: false }).eq('id', s.projA), 'unseal project A');
  got = await idsIn(est, 'bid_submissions', 'id', s.projA);
  report.check('sealed', 'estimator (aal1): sees both submissions once unsealed',
    got.length === want.length && want.every((id) => got.includes(id)), `${got.length} rows`);
  for (const role of ['estimator', 'project_admin', 'pm'] as const) {
    n = await pricingRows(clientOf(clients, role));
    report.check('money', `${role} (aal1): no bid_extraction_pricing once unsealed`, n === 0, `${n} rows`);
  }
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
  report.todo('money', 'bid_extraction_pricing readable at aal2', 'positive check needs a TOTP (aal2) sign-in; covered in 08_bids.sql');
}

// Inspection requests (SPEC §13.2, 0024): a requester sees other people's requests only as time, type and color.
async function checkRequests(s: Seed, clients: Map<UserKey, Client>): Promise<void> {
  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const ask = (key: UserKey, items: string) => rpcRow(clientOf(clients, key), 'ir_submit', {
    p_project_id: s.projA, p_company: `Probe ${key}`, p_request_date: day, p_kind: 'ior', p_items: items, p_notice_ack: true,
    p_start_time: '09:00', p_duration_min: 60,
  });
  const mine = str(await ask('sub', `probe sub ${RUN}`), 'id');
  const theirs = str(await ask('foreman', `probe foreman ${RUN}`), 'id');
  const cal = must(await clientOf(clients, 'sub').rpc('ir_calendar', { p_project_id: s.projA, p_from: day, p_to: day }), 'ir_calendar');
  const others = cal.filter((r) => r['mine'] !== true);
  report.check('requests', 'sub: sees the other request on the calendar', others.length === 1, `${others.length} rows`);
  const leaks = others.filter((r) => r['id'] !== null || r['company'] !== null || r['items'] !== null || r['number'] !== null);
  report.check('requests', 'sub: other request has no id, number, company or items', leaks.length === 0, JSON.stringify(leaks));
  report.check('requests', 'sub: other request row unreadable', (await count(clientOf(clients, 'sub'), 'inspection_requests', 'id', theirs)) === 0);
  report.check('requests', 'sub: own request readable', (await count(clientOf(clients, 'sub'), 'inspection_requests', 'id', mine)) === 1);
  const insp = must(await clientOf(clients, 'inspector').rpc('ir_calendar', { p_project_id: s.projA, p_from: day, p_to: day }), 'ir_calendar');
  report.check('requests', 'inspector: both requests in full', insp.filter((r) => r['full_detail'] === true && r['company'] !== null).length === 2);
  const arch = await clientOf(clients, 'architect').rpc('ir_calendar', { p_project_id: s.projA, p_from: day, p_to: day });
  report.check('requests', 'architect (no IR capability): calendar refused', Boolean(arch.error), arch.error ? arch.error.message : 'rows returned');
}

// Deliveries (SPEC §13.3, §6.4 #3): RLS by capability, overlap -> Standby, and the delivery link from outside: board
// fields only, and a rotated token locks out the old one.
async function linkBoard(projectId: string, token: string): Promise<Response> {
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return fetch(`${url}/functions/v1/delivery-board`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'board', project_id: projectId, token, from: day, to: day }),
  });
}

async function checkDeliveries(s: Seed, clients: Map<UserKey, Client>): Promise<void> {
  must(await service.from('projects').update({ modules: ['bids', 'files', 'calendar', 'deliveries'] }).eq('id', s.projA), 'deliveries on');
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const post = async (key: UserKey, time: string) => {
    const res = await clientOf(clients, key).rpc('post_delivery', {
      p_project_id: s.projA, p_company: `Probe Co ${RUN}`, p_date: day, p_duration: 60, p_description: `Probe ${key}`, p_time: time,
    });
    if (res.error) throw new Error(`post_delivery as ${key}: ${res.error.message}`);
    return String(res.data);
  };
  const first = await post('foreman', '07:00');
  const second = await post('sub', '07:30');
  const rows = must(await clientOf(clients, 'inspector').from('deliveries').select('id, standby').eq('project_id', s.projA), 'deliveries');
  report.check('deliveries', 'inspector (view) sees both', rows.length === 2, `${rows.length} rows`);
  report.check('deliveries', 'the overlapping post is Standby',
    rows.find((r) => r['id'] === second)?.['standby'] === true && rows.find((r) => r['id'] === first)?.['standby'] === false);
  const bidderRows = await count(clientOf(clients, 'bidder'), 'deliveries', 'project_id', s.projA);
  report.check('deliveries', 'bidder sees no deliveries', bidderRows === 0, `${bidderRows} rows`);
  const inspectorPost = await clientOf(clients, 'inspector').rpc('post_delivery', {
    p_project_id: s.projA, p_company: 'x', p_date: day, p_duration: 60, p_description: 'x',
  });
  report.check('deliveries', 'inspector cannot post', inspectorPost.error !== null);
  const subRotate = await clientOf(clients, 'sub').rpc('rotate_delivery_link', { p_project_id: s.projA });
  report.check('deliveries', 'sub cannot make the link', subRotate.error !== null);

  const rotate = async () => {
    const res = await clientOf(clients, 'superintendent').rpc('rotate_delivery_link', { p_project_id: s.projA });
    if (res.error) throw new Error(`rotate_delivery_link: ${res.error.message}`);
    return String(res.data);
  };
  const oldToken = await rotate();
  const res = await linkBoard(s.projA, oldToken);
  const text = await res.text();
  report.check('delivery link', 'the link opens the board (200)', res.status === 200, `status ${res.status}`);
  const body = JSON.parse(text) as { deliveries?: Record<string, unknown>[] };
  const keys = [...new Set((body.deliveries ?? []).flatMap((d) => Object.keys(d)))].sort().join(',');
  report.check('delivery link', 'board fields only', keys === 'company,delivery_date,description,duration_min,number,standby,starts_at', keys);
  const leaks = [first, second, user(s, 'foreman').id, user(s, 'foreman').email, 'Probe foreman'].filter((v) => text.includes(v));
  report.check('delivery link', 'no ids, emails or poster names', leaks.length === 0, leaks.join(', '));
  const newToken = await rotate();
  const [oldRes, newRes] = await Promise.all([linkBoard(s.projA, oldToken), linkBoard(s.projA, newToken)]);
  report.check('delivery link', 'rotating locks out the old link (404)', oldRes.status === 404, `status ${oldRes.status}`);
  report.check('delivery link', 'the new link works (200)', newRes.status === 200, `status ${newRes.status}`);
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
    const get = (k: UserKey): Client => clientOf(clients, k);
    await report.guard('matrix', 'capability matrix', () => checkMatrix(s, clients));
    await checkIsolation(s, get('pm'), 'pm (A)');
    await checkIsolation(s, get('project_admin'), 'org A owner');
    await checkLockedOut(s, get('expired'), 'access_ends_at passed');
    await checkLockedOut(s, get('revoked'), 'revoked');
    const bids = await seedBids(s, clients);
    await report.guard('bidder wall', 'bidder wall', () => checkBidderWall(s, clients, bids));
    await report.guard('money', 'pricing', () => checkPricing(s, clients));
    await report.guard('sealed', 'sealed bids', () => checkSealed(s, clients, bids));
    await report.guard('requests', 'inspection requests', () => checkRequests(s, clients));
    await report.guard('deliveries', 'deliveries', () => checkDeliveries(s, clients));
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
