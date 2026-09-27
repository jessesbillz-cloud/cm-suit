// Invite a person to a project (SPEC §6.4 #1, §10.3). Admin function in admin_service_key_allowlist.txt.
//
// Order matters: requireUser → requireCapability('members.manage') → only then the service client.
// Service role is needed to create access_links (no user insert policy; token hashes are never user-writable).
//
// Idempotent: inviting the same email + role again updates the membership, revokes every older access link for it,
// and sends a NEW link. The raw token is returned once (in link_url) and never stored.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { email, parseJson, uuid, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';
import { inviteEmail, sendEmail } from '../_shared/email.ts';
import { BRAND_NAME, appUrl } from '../_shared/env.ts';
import { randomToken, sha256Hex } from '../_shared/crypto.ts';

const Body = z.object({
  project_id: uuid,
  email,
  role: z.string().min(1).max(64),
  member_org_id: uuid.nullable().optional(),
  /** Omit to keep the current value on a re-invite; null clears it. */
  access_ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  scopes: z.array(z.object({ scope_type: z.string().min(1).max(64), scope_id: z.string().min(1).max(200) }).strict())
    .max(200).optional(),
}).strict();
type Input = z.output<typeof Body>;

interface MemberRow {
  id: string;
  org_id: string;
  project_id: string;
  invite_email: string;
  role: string;
  status: 'invited' | 'active' | 'revoked';
  user_id: string | null;
}

const MEMBER_COLS = 'id, org_id, project_id, invite_email, role, status, user_id';

async function upsertMember(service: Db, b: Input, orgId: string, actorId: string): Promise<MemberRow> {
  const existing = must(
    await service.from('project_members').select(MEMBER_COLS)
      .eq('project_id', b.project_id).eq('invite_email', b.email).eq('role', b.role).maybeSingle(),
    'member lookup',
  ) as MemberRow | null;

  if (!existing) {
    return must(
      await service.from('project_members').insert({
        org_id: orgId,
        project_id: b.project_id,
        invite_email: b.email,
        member_org_id: b.member_org_id ?? null,
        role: b.role,
        status: 'invited',
        access_ends_at: b.access_ends_at ?? null,
        invited_by: actorId,
        created_by: actorId,
      }).select(MEMBER_COLS).single(),
      'member insert',
    ) as MemberRow;
  }

  const patch: Record<string, unknown> = { invited_by: actorId };
  if (b.member_org_id !== undefined) patch.member_org_id = b.member_org_id;
  if (b.access_ends_at !== undefined) patch.access_ends_at = b.access_ends_at;
  if (existing.status === 'revoked') {
    // Re-inviting a revoked person starts over: they accept again (accept_invites binds by email on sign-in).
    Object.assign(patch, { status: 'invited', user_id: null, revoked_at: null });
  }
  return must(
    await service.from('project_members').update(patch).eq('id', existing.id).select(MEMBER_COLS).single(),
    'member update',
  ) as MemberRow;
}

async function addScopes(service: Db, memberId: string, scopes: Input['scopes'], actorId: string): Promise<void> {
  if (!scopes || scopes.length === 0) return;
  // Additive and safe to repeat. Removing a scope is a separate action.
  const { error } = await service.from('member_scopes').upsert(
    scopes.map((s) => ({ project_member_id: memberId, scope_type: s.scope_type, scope_id: s.scope_id, created_by: actorId })),
    { onConflict: 'project_member_id,scope_type,scope_id', ignoreDuplicates: true },
  );
  if (error) throw new HttpError(500, `member_scopes upsert: ${error.message}`);
}

async function freshLink(service: Db, memberId: string, actorId: string): Promise<{ id: string; token: string }> {
  const now = new Date().toISOString();
  const { error: revokeError } = await service.from('access_links')
    .update({ revoked_at: now }).eq('project_member_id', memberId).is('revoked_at', null);
  if (revokeError) throw new HttpError(500, `access_links revoke: ${revokeError.message}`);
  const token = randomToken(32);
  const link = must(
    await service.from('access_links')
      .insert({ project_member_id: memberId, token_hash: await sha256Hex(token), created_by: actorId })
      .select('id').single(),
    'access_links insert',
  ) as { id: string };
  return { id: link.id, token };
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 64 * 1024);
  await requireCapability(client, body.project_id, 'members.manage');

  const service = serviceClient();
  const project = must(
    await service.from('projects').select('id, org_id, name').eq('id', body.project_id).is('deleted_at', null).maybeSingle(),
    'project lookup',
  ) as { id: string; org_id: string; name: string } | null;
  if (!project) throw new HttpError(404, 'Project not found');

  const role = must(
    await service.from('roles').select('name, description').eq('name', body.role).maybeSingle(),
    'role lookup',
  ) as { name: string; description: string } | null;
  if (!role) throw new HttpError(400, 'Unknown role');

  if (body.member_org_id) {
    const org = must(await service.from('orgs').select('id').eq('id', body.member_org_id).maybeSingle(), 'org lookup');
    if (!org) throw new HttpError(400, 'Unknown member_org_id');
  }

  const member = await upsertMember(service, body, project.org_id, user.id);
  await addScopes(service, member.id, body.scopes, user.id);
  const link = await freshLink(service, member.id, user.id);
  const linkUrl = `${appUrl()}/a/${link.id}?t=${link.token}`;

  // Recipient = the membership row's invite_email as stored, not the request body.
  const brand = BRAND_NAME();
  const msg = inviteEmail({ brand, projectName: project.name, roleLabel: role.description || role.name, linkUrl });
  const sent = await sendEmail(service, {
    kind: 'invite',
    projectId: project.id,
    orgId: project.org_id,
    toEmail: member.invite_email,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    entityType: 'project_member',
    entityId: member.id,
    tag: 'invite',
    createdBy: user.id,
  });

  await audit(service, {
    action: 'member.invite_sent', actorKind: 'user', actorUserId: user.id, entityType: 'project_member', entityId: member.id,
    projectId: project.id, orgId: project.org_id, req,
    details: { role: member.role, invite_email: member.invite_email, access_link_id: link.id, email_status: sent.status },
  });
  // Posted as the caller (user client) so the board shows who invited.
  await rpc<string>(client, 'post_activity', {
    p_project_id: project.id,
    p_kind: 'member.invited',
    p_summary: `${member.invite_email} invited as ${role.description || role.name}`.slice(0, 500),
    p_entity_type: 'project_member',
    p_entity_id: member.id,
    p_audience_capability: 'members.manage',
  });

  return ok(req, {
    member_id: member.id,
    status: member.status,
    link_url: linkUrl,
    email_status: sent.status,
    email_error: sent.error,
  });
}));
