// Audit from edge functions: calls the SQL audit() RPC, which is granted to service_role only (SPEC §5.4).
// The caller passes its service-role client in; this module never creates one.
//
// audit() takes the actor from auth.uid(), which is null for the service role, so the acting user (when there is
// one) is recorded in details.actor_user_id, and the caller's IP / user agent in details (the SQL side would only see
// the edge function's own address).
import { type Db, rpc } from './db.ts';
import { clientIp } from './ratelimit.ts';

export type ActorKind = 'user' | 'system' | 'cron' | 'webhook' | 'worker' | 'public_link';

export interface AuditEntry {
  action: string;
  actorKind: ActorKind;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  orgId?: string | null;
  details?: Record<string, unknown>;
  contentHash?: string | null;
  actorUserId?: string | null;
  req?: Request;
}

export async function audit(service: Db, e: AuditEntry): Promise<number> {
  const details: Record<string, unknown> = { ...(e.details ?? {}) };
  if (e.actorUserId) details.actor_user_id = e.actorUserId;
  if (e.req) {
    details.ip = clientIp(e.req);
    details.user_agent = e.req.headers.get('user-agent');
  }
  return await rpc<number>(service, 'audit', {
    p_action: e.action,
    p_entity_type: e.entityType ?? null,
    p_entity_id: e.entityId ?? null,
    p_project_id: e.projectId ?? null,
    p_org_id: e.orgId ?? null,
    p_details: details,
    p_content_hash: e.contentHash ?? null,
    p_actor_kind: e.actorKind,
  });
}
