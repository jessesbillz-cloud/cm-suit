// Revoke a project member (SPEC §10.3). Admin function in admin_service_key_allowlist.txt.
//
// Order: requireUser → look the member up AS THE CALLER (RLS; unseen = 404) → requireCapability('members.manage') on
// that member's project → only then the service client. Setting status = 'revoked' fires tg_member_revoked, which
// revokes the member's access links and share links; RLS reads status live, so access ends immediately.
import { handle, HttpError, noContent } from '../_shared/http.ts';
import { must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';

const Body = z.object({ member_id: uuid }).strict();

interface MemberRow {
  id: string;
  org_id: string;
  project_id: string;
  invite_email: string;
  role: string;
  status: string;
  user_id: string | null;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  const member = must(
    await client.from('project_members').select('id, org_id, project_id, invite_email, role, status, user_id')
      .eq('id', body.member_id).maybeSingle(),
    'member lookup',
  ) as MemberRow | null;
  if (!member) throw new HttpError(404, 'Member not found');
  await requireCapability(client, member.project_id, 'members.manage');

  if (member.user_id === user.id) throw new HttpError(409, 'You cannot revoke your own access');
  if (member.status === 'revoked') return noContent(req); // already done: safe to repeat

  const service = serviceClient();
  const { error } = await service.from('project_members')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', member.id);
  if (error) throw new HttpError(500, `member revoke: ${error.message}`);

  await audit(service, {
    action: 'member.revoked_by', actorKind: 'user', actorUserId: user.id, entityType: 'project_member', entityId: member.id,
    projectId: member.project_id, orgId: member.org_id, req,
    details: { role: member.role, invite_email: member.invite_email },
  });
  await rpc<string>(client, 'post_activity', {
    p_project_id: member.project_id,
    p_kind: 'member.revoked',
    p_summary: `${member.invite_email} removed from the project`.slice(0, 500),
    p_entity_type: 'project_member',
    p_entity_id: member.id,
    p_audience_capability: 'members.manage',
  });

  return noContent(req);
}));
