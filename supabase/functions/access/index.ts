// PUBLIC ENDPOINT (SPEC §6.4 #1): permanent access link + email code.
//
// Why public: invited outside people (bidders, subs, architects, owner reps, inspectors' offices) open the link in
// their invite email before they have a session. The link id + 32-byte random token are the secret (only its SHA-256
// is stored). This endpoint grants nothing by itself: it only tells the page which address to send the Supabase Auth
// email code to (signInWithOtp). Access comes from signing in with that code, then accept_invites() binding the
// membership, then RLS. A revoked link / revoked member / passed access_ends_at resolves to 404.
//
// Returns the full invited email only for a valid, rate-limited link: the client needs it for signInWithOtp, and
// whoever holds the link was sent it at that address.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient } from '../_shared/db.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { maskEmail } from '../_shared/email.ts';

const Body = z.object({
  link_id: uuid,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token'),
}).strict();

interface LinkRow {
  invite_email: string;
  project_id: string;
  project_name: string;
  role: string;
  status: string;
}

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  await limit(service, `access:ip:${clientIp(req) ?? 'unknown'}`, 20, 20 / 60);
  const body = await parseJson(req, Body, 4096);
  await limit(service, `access:link:${body.link_id}`, 10, 10 / 60);

  const rows = await rpc<LinkRow[]>(service, 'resolve_access_link', {
    p_link_id: body.link_id,
    p_token_hash: await sha256Hex(body.token),
  });
  const hit = rows?.[0];
  if (!hit) throw new HttpError(404, 'This link is no longer active. Ask the person who invited you for a new one.');

  await audit(service, {
    action: 'access_link.open',
    actorKind: 'public_link',
    entityType: 'access_link',
    entityId: body.link_id,
    projectId: hit.project_id,
    req,
  });

  return ok(req, {
    ok: true,
    email: hit.invite_email,
    email_masked: maskEmail(hit.invite_email),
    project_id: hit.project_id,
    project_name: hit.project_name,
  });
}));
