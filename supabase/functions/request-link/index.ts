// PUBLIC ENDPOINT (SPEC §6.4 #4): the job's inspection request link (/r/<job>?t=<token>, on the QR sheet posted on
// site) and the inspector's hub (/h/<hub>?t=<token>, one link for all their jobs; MDR's hub.html).
//
// Why public: subs and their foremen open the link or scan the QR code before they have an account, the way Jesse's
// MDR request page works. The tokens are the secret: 32 random bytes, only their SHA-256 stored (projects.
// request_token_hash, request_hubs.token_hash), rotated by the job's members.manage / the hub's owner, which locks the
// old link out at once.
//
// One function, three actions, because the hub is only a second key to the same pages: one rate-limit family, one set
// of probe entries, one contract (_shared/requestLink.ts).
//   open  the job's name, and whether the caller's own session (if any) is already on the job;
//   join  AFTER the visitor proved their email with the Auth email code: records a sub invite on that job for the
//         signed-in address (from the session, never the body); accept_invites then binds it. An address already on
//         the job is never changed; a revoked or ended one is refused (403). Fills a blank profile name / company.
//   hub   the hub's job names and ids.
// This endpoint grants nothing by itself: access comes from the email code, accept_invites and RLS, and a People
// revoke ends it. The testing switch that relaxes re-confirmation elsewhere (0036) plays no part here: joining always
// needs a session for the address, which only the email code gives.
// Answers carry only what the pages show, enforced twice: by the service-role-only SQL (link_request_* in 0046) and by
// the projections in _shared/requestLink.ts; a database error reaches the visitor only as our own plain refusal, never
// Postgres' text or details (publicRpc, 0054). Rate limits per IP (the address the edge saw, clientIp) and per token on
// every call, tighter ones on join.
import { created, handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, publicDbError, publicRpc, serviceClient } from '../_shared/db.ts';
import { optionalUser, requireUser } from '../_shared/auth.ts';
import { parseJson } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { hubAnswer, joinAnswer, openAnswer, RequestLinkBody } from '../_shared/requestLink.ts';

const NOT_ACTIVE = 'This link is not active. Ask the inspector for the current one.';

/** A blank profile name or company takes what the visitor typed; anything already there stays. Runs as the user. */
async function fillProfile(client: Db, userId: string, name: string, company: string): Promise<void> {
  const steps = [
    client.from('profiles').update({ full_name: name }).eq('user_id', userId).eq('full_name', ''),
    client.from('profiles').update({ company }).eq('user_id', userId).is('company', null),
    client.from('profiles').update({ company }).eq('user_id', userId).eq('company', ''),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw publicDbError(error, 'profile fill');
  }
}

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  const ip = clientIp(req) ?? 'unknown';
  await limit(service, `request-link:ip:${ip}`, 30, 0.5);
  const body = await parseJson(req, RequestLinkBody, 4096);
  const tokenHash = await sha256Hex(body.token);
  // Keyed by the hash, never the raw token. A QR sheet on a busy site: many phones, one token.
  const tokenKey = tokenHash.slice(0, 32);
  await limit(service, `request-link:token:${tokenKey}`, 120, 2);

  if (body.action === 'hub') {
    const raw = await publicRpc<unknown>(service, 'link_request_hub', { p_hub_id: body.hub_id, p_token_hash: tokenHash });
    if (raw === null) throw new HttpError(404, NOT_ACTIVE);
    return ok(req, hubAnswer(raw));
  }

  const link = { p_project_id: body.project_id, p_token_hash: tokenHash, p_hub_id: body.hub_id ?? null };

  if (body.action === 'open') {
    const raw = await publicRpc<unknown>(service, 'link_request_open', link);
    if (raw === null) throw new HttpError(404, NOT_ACTIVE);
    // Only about the caller's own session, asked as the caller (RLS helpers read auth.uid()).
    const me = await optionalUser(req);
    const member = me ? await publicRpc<boolean>(me.client, 'is_member', { p_project_id: body.project_id }) : false;
    const canRequest = me && member
      ? await publicRpc<boolean>(me.client, 'has_capability', { p_project_id: body.project_id, p_cap: 'ir.request' })
      : false;
    return ok(req, openAnswer(raw, member === true, canRequest === true));
  }

  // join
  await limit(service, `request-link:join-ip:${ip}`, 10, 10 / 3600);
  await limit(service, `request-link:join-token:${tokenKey}`, 60, 60 / 3600);
  const { user, client } = await requireUser(req);
  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Sign in with an email address first.');
  const raw = await publicRpc<unknown>(service, 'link_request_join', { ...link, p_email: email, p_name: body.name, p_company: body.company });
  if (raw === null) throw new HttpError(404, NOT_ACTIVE);
  const answer = joinAnswer(raw);
  await fillProfile(client, user.id, body.name, body.company);
  // The SQL audit row has the typed name and company; this one adds who and where the visit came from.
  await audit(service, {
    action: 'request_link.visit',
    actorKind: 'public_link',
    actorUserId: user.id,
    entityType: 'project',
    entityId: body.project_id,
    projectId: body.project_id,
    details: { status: answer.status, via: body.hub_id ? 'hub' : 'link' },
    req,
  });
  return answer.status === 'added' ? created(req, answer) : ok(req, answer);
}));
