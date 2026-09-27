// Invite bidders to one or more packages (SPEC §11.3). Admin function in admin_service_key_allowlist.txt.
//
// Order: requireUser → requireCapability('bids.manage') → only then the service client. Service role is needed for
// project_members / member_scopes / access_links / bid_invites / sub_history writes (no user insert policies) and email.
//
// Per recipient: a walled member (the role holding bids.submit, read from role_permissions — no role name in code),
// status 'invited', access_ends_at = bid_due_at + grace; a 'bid_package' scope per package; old access links revoked
// and one fresh link; one bid_invites row per package (kept on re-invite); sub_history 'invited' rows when the
// recipient maps to a directory sub; ONE invitation email. Re-inviting is idempotent: same member, same invites,
// new link, new email. Recipients are read back from the database rows before mailing (SPEC §8.4).
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { email, parseJson, uuid, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';
import { bidInviteEmail, sendEach, sendEmail, type SendStatus } from '../_shared/email.ts';
import { BRAND_NAME, appUrl } from '../_shared/env.ts';
import { randomToken, sha256Hex } from '../_shared/crypto.ts';

const Body = z.object({
  project_id: uuid,
  package_ids: z.array(uuid).min(1).max(50),
  recipients: z.array(z.object({
    email,
    company: z.string().trim().min(1).max(200).optional(),
    sub_id: uuid.optional(),
  }).strict()).min(1).max(200),
  access_ends_grace_hours: z.number().int().min(0).max(24 * 60).default(24),
}).strict();
type Input = z.output<typeof Body>;

interface Project { id: string; org_id: string; name: string; timezone: string; bid_due_at: string | null }
interface Pkg { id: string; code: string; name: string }
interface Member { id: string; invite_email: string; role: string; status: 'invited' | 'active' | 'revoked' }
interface Recipient { email: string; subId: string | null }
interface Skipped { email: string; reason: 'duplicate_in_request' | 'unknown_sub' | 'already_on_project' }
interface Invited { email: string; member_id: string; link_url: string; email_status: SendStatus }

const MEMBER_COLS = 'id, invite_email, role, status';

/** The one role that holds bids.submit. Zero or several is a capability-matrix problem: refuse. */
async function bidderRole(service: Db): Promise<string> {
  const rows = must(await service.from('role_permissions').select('role').eq('capability', 'bids.submit'), 'bidder role') as
    { role: string }[];
  if (rows.length !== 1) throw new HttpError(500, `Server misconfigured: expected one bids.submit role, found ${rows.length}`);
  return rows[0].role;
}

function dueLabel(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Directory sub for a company name, created when missing (unique on org_id + lower(company)). */
async function subForCompany(service: Db, orgId: string, company: string, contactEmail: string, actorId: string): Promise<string> {
  const find = async () =>
    must(
      await service.from('subs').select('id').eq('org_id', orgId).ilike('company', ilikeExact(company)).is('deleted_at', null).limit(1),
      'subs lookup',
    ) as { id: string }[];
  const found = await find();
  if (found.length) return found[0].id;
  const { data, error } = await service.from('subs')
    .insert({ org_id: orgId, company, contacts: [{ email: contactEmail }], created_by: actorId }).select('id').single();
  if (error?.code === '23505') {
    const again = await find(); // created concurrently
    if (again.length) return again[0].id;
  }
  if (error || !data) throw new HttpError(500, `subs insert: ${error?.message ?? 'no row'}`);
  return (data as { id: string }).id;
}

/** Dedupes by email and resolves each recipient's directory sub. */
async function resolveRecipients(service: Db, b: Input, orgId: string, actorId: string):
  Promise<{ recipients: Recipient[]; skipped: Skipped[] }> {
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  const unique = b.recipients.filter((r) => {
    if (seen.has(r.email)) {
      skipped.push({ email: r.email, reason: 'duplicate_in_request' });
      return false;
    }
    seen.add(r.email);
    return true;
  });

  const subIds = [...new Set(unique.flatMap((r) => (r.sub_id ? [r.sub_id] : [])))];
  const known = new Set<string>();
  if (subIds.length) {
    const rows = must(
      await service.from('subs').select('id').in('id', subIds).eq('org_id', orgId).is('deleted_at', null),
      'subs check',
    ) as { id: string }[];
    for (const r of rows) known.add(r.id);
  }

  const byCompany = new Map<string, string>();
  const recipients: Recipient[] = [];
  for (const r of unique) {
    if (r.sub_id) {
      if (!known.has(r.sub_id)) skipped.push({ email: r.email, reason: 'unknown_sub' });
      else recipients.push({ email: r.email, subId: r.sub_id });
      continue;
    }
    if (!r.company) {
      recipients.push({ email: r.email, subId: null });
      continue;
    }
    const key = r.company.toLowerCase();
    let id = byCompany.get(key);
    if (!id) {
      id = await subForCompany(service, orgId, r.company, r.email, actorId);
      byCompany.set(key, id);
    }
    recipients.push({ email: r.email, subId: id });
  }
  return { recipients, skipped };
}

/** Inserts or re-arms the bidder memberships. Emails already on the project in another role are skipped. */
async function upsertMembers(
  service: Db, project: Project, role: string, recipients: Recipient[], accessEndsAt: string | null, actorId: string,
): Promise<{ members: Map<string, Member>; skipped: Skipped[] }> {
  const emails = recipients.map((r) => r.email);
  const existing = must(
    await service.from('project_members').select(MEMBER_COLS).eq('project_id', project.id).in('invite_email', emails),
    'member lookup',
  ) as Member[];

  const skipped: Skipped[] = [];
  const members = new Map<string, Member>();
  const otherRole = new Set(existing.filter((m) => m.role !== role && m.status !== 'revoked').map((m) => m.invite_email));
  for (const m of existing) if (m.role === role) members.set(m.invite_email, m);

  const toInsert = recipients.filter((r) => !members.has(r.email) && !otherRole.has(r.email));
  for (const e of otherRole) if (!members.has(e)) skipped.push({ email: e, reason: 'already_on_project' });

  if (toInsert.length) {
    const rows = must(
      await service.from('project_members').insert(toInsert.map((r) => ({
        org_id: project.org_id, project_id: project.id, invite_email: r.email, member_org_id: null, role,
        status: 'invited', access_ends_at: accessEndsAt, invited_by: actorId, created_by: actorId,
      }))).select(MEMBER_COLS),
      'member insert',
    ) as Member[];
    for (const m of rows) members.set(m.invite_email, m);
  }

  const reinvited = existing.filter((m) => m.role === role);
  if (reinvited.length) {
    const patch: Record<string, unknown> = { invited_by: actorId };
    if (accessEndsAt) patch.access_ends_at = accessEndsAt;
    const { error } = await service.from('project_members').update(patch).in('id', reinvited.map((m) => m.id));
    if (error) throw new HttpError(500, `member update: ${error.message}`);
    // A revoked bidder starts over: they accept again on sign-in (accept_invites binds by email).
    const revoked = reinvited.filter((m) => m.status === 'revoked');
    if (revoked.length) {
      const rows = must(
        await service.from('project_members').update({ status: 'invited', user_id: null, revoked_at: null })
          .in('id', revoked.map((m) => m.id)).select(MEMBER_COLS),
        'member re-arm',
      ) as Member[];
      for (const m of rows) members.set(m.invite_email, m);
    }
  }
  return { members, skipped };
}

/** Revokes every live link for these members and mints one new link each. Raw tokens are returned once, never stored. */
async function freshLinks(service: Db, memberIds: string[], actorId: string): Promise<Map<string, { id: string; token: string }>> {
  const { error: revokeError } = await service.from('access_links')
    .update({ revoked_at: new Date().toISOString() }).in('project_member_id', memberIds).is('revoked_at', null);
  if (revokeError) throw new HttpError(500, `access_links revoke: ${revokeError.message}`);
  const minted = await Promise.all(memberIds.map(async (id) => {
    const token = randomToken(32);
    return { id, token, hash: await sha256Hex(token) };
  }));
  const rows = must(
    await service.from('access_links')
      .insert(minted.map((m) => ({ project_member_id: m.id, token_hash: m.hash, created_by: actorId })))
      .select('id, project_member_id'),
    'access_links insert',
  ) as { id: string; project_member_id: string }[];
  const tokenOf = new Map(minted.map((m) => [m.id, m.token]));
  const out = new Map<string, { id: string; token: string }>();
  for (const r of rows) out.set(r.project_member_id, { id: r.id, token: tokenOf.get(r.project_member_id) as string });
  if (out.size !== memberIds.length) throw new HttpError(500, 'access_links insert: row count mismatch');
  return out;
}

async function upsertIgnore(service: Db, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await service.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new HttpError(500, `${table} upsert: ${error.message}`);
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 128 * 1024);
  await requireCapability(client, body.project_id, 'bids.manage');

  const service = serviceClient();
  const project = must(
    await service.from('projects').select('id, org_id, name, timezone, bid_due_at').eq('id', body.project_id)
      .is('deleted_at', null).maybeSingle(),
    'project lookup',
  ) as Project | null;
  if (!project) throw new HttpError(404, 'Project not found');

  const packageIds = [...new Set(body.package_ids)];
  const packages = must(
    await service.from('bid_packages').select('id, code, name').eq('project_id', project.id).in('id', packageIds)
      .is('deleted_at', null).order('code'),
    'package lookup',
  ) as Pkg[];
  if (packages.length !== packageIds.length) throw new HttpError(400, 'One or more packages are not on this project');

  const role = await bidderRole(service);
  const accessEndsAt = project.bid_due_at
    ? new Date(Date.parse(project.bid_due_at) + body.access_ends_grace_hours * 3_600_000).toISOString()
    : null;
  if (accessEndsAt && Date.parse(accessEndsAt) <= Date.now()) {
    throw new HttpError(400, 'Bid time plus the grace period has passed; move the bid time or raise the grace first');
  }

  const resolved = await resolveRecipients(service, body, project.org_id, user.id);
  const upserted = await upsertMembers(service, project, role, resolved.recipients, accessEndsAt, user.id);
  const skipped = [...resolved.skipped, ...upserted.skipped];
  const targets = resolved.recipients.flatMap((r) => {
    const m = upserted.members.get(r.email);
    return m ? [{ ...r, member: m }] : [];
  });

  if (targets.length) {
    const memberIds = targets.map((t) => t.member.id);
    await upsertIgnore(service, 'member_scopes', targets.flatMap((t) => packages.map((p) => ({
      project_member_id: t.member.id, scope_type: 'bid_package', scope_id: p.id, created_by: user.id,
    }))), 'project_member_id,scope_type,scope_id');
    await upsertIgnore(service, 'bid_invites', targets.flatMap((t) => packages.map((p) => ({
      org_id: project.org_id, project_id: project.id, package_id: p.id, member_id: t.member.id, sub_id: t.subId,
      created_by: user.id,
    }))), 'package_id,member_id');
    const history = targets.filter((t) => t.subId).flatMap((t) => packages.map((p) => ({
      org_id: project.org_id, sub_id: t.subId, project_id: project.id, kind: 'invited',
      details: { package_id: p.id, package_code: p.code, member_id: t.member.id },
    })));
    if (history.length) {
      const { error } = await service.from('sub_history').insert(history);
      if (error) throw new HttpError(500, `sub_history insert: ${error.message}`);
    }
    const links = await freshLinks(service, memberIds, user.id);

    const origin = appUrl();
    const brand = BRAND_NAME();
    const label = dueLabel(project.bid_due_at, project.timezone);
    const invited: Invited[] = [];
    await sendEach(targets, async (t) => {
      const link = links.get(t.member.id) as { id: string; token: string };
      const linkUrl = `${origin}/a/${link.id}?t=${link.token}`;
      const msg = bidInviteEmail({ brand, projectName: project.name, packages, bidDueLabel: label, linkUrl });
      // Recipient = the membership row's invite_email as stored.
      const sent = await sendEmail(service, {
        kind: 'bid_invite', projectId: project.id, orgId: project.org_id, toEmail: t.member.invite_email,
        subject: msg.subject, html: msg.html, text: msg.text, entityType: 'project_member', entityId: t.member.id,
        tag: 'bid_invite', createdBy: user.id, replyTo: user.email ?? null,
      });
      await audit(service, {
        action: 'bid.invite_sent', actorKind: 'user', actorUserId: user.id, entityType: 'project_member',
        entityId: t.member.id, projectId: project.id, orgId: project.org_id, req,
        details: {
          invite_email: t.member.invite_email, packages: packages.map((p) => p.code), sub_id: t.subId,
          access_link_id: link.id, email_status: sent.status,
        },
      });
      invited.push({ email: t.member.invite_email, member_id: t.member.id, link_url: linkUrl, email_status: sent.status });
    });

    // Posted as the caller so the board shows who invited. Visible to bids.manage only (bidders never see the list).
    await rpc<string>(client, 'post_activity', {
      p_project_id: project.id,
      p_kind: 'bid.invited',
      p_summary: `${invited.length} bidder${invited.length === 1 ? '' : 's'} invited: ${packages.map((p) => p.code).join(', ')}`
        .slice(0, 500),
      p_entity_type: null,
      p_entity_id: null,
      p_audience_capability: 'bids.manage',
    });
    return ok(req, { invited, skipped });
  }

  return ok(req, { invited: [], skipped });
}));
