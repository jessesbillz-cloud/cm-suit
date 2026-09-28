// PUBLIC ENDPOINT (testing only; SPEC §6.4 exception agreed with Jesse on Sep 28, docs/decisions.md): personal sign-in
// links. /k/<key> signs its owner straight in, with no email and no code, while Jesse and Matt test.
//
// Why public: the person has no session yet; the key is the secret (32 random bytes, only its SHA-256 is stored, and
// only for addresses on the sign-in allowlist; revocable). The answer is a one-time Supabase token hash made on the
// spot with the admin API (nothing is emailed, so no email scanner can burn it); the page exchanges it for a session
// at once (verifyOtp). Rate-limited per IP and per key; an unknown or revoked key is a bare 404.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient } from '../_shared/db.ts';
import { parseJson, z } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { sha256Hex } from '../_shared/crypto.ts';

const Body = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed key'),
}).strict();

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  await limit(service, `key-login:ip:${clientIp(req) ?? 'unknown'}`, 10, 10 / 60);
  const body = await parseJson(req, Body, 1024);
  const keyHash = await sha256Hex(body.key);
  await limit(service, `key-login:key:${keyHash}`, 10, 10 / 60);

  const email = await rpc<string | null>(service, 'signin_key_email', { p_token_hash: keyHash });
  if (!email) throw new HttpError(404, 'This sign-in link is not active.');

  let link = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error && /not found|no user/i.test(link.error.message)) {
    // First sign-in for an allowlisted person: make the account, then the one-time token.
    const made = await service.auth.admin.createUser({ email, email_confirm: true });
    if (made.error) throw new HttpError(500, `key-login createUser: ${made.error.message}`);
    link = await service.auth.admin.generateLink({ type: 'magiclink', email });
  }
  if (link.error || !link.data.properties?.hashed_token) {
    throw new HttpError(500, `key-login generateLink: ${link.error?.message ?? 'no token'}`);
  }

  await audit(service, { action: 'signin_key.use', actorKind: 'public_link', entityType: 'signin_key', req, details: { email } });
  return ok(req, { token_hash: link.data.properties.hashed_token });
}));
