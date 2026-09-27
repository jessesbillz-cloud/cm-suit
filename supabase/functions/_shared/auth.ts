// The only auth gates for edge functions (SPEC §6.3). requireUser is the real gate; verify_jwt is a second layer.
import { HttpError } from './http.ts';
import { env } from './env.ts';
import { type Db, type User, rpc, userClient } from './db.ts';
import { base64ToBytes, base64UrlToText, hmacSha256Base64, safeEqual } from './crypto.ts';

export interface Authed {
  user: User;
  /** Acts as the caller; RLS applies. */
  client: Db;
  jwt: string;
}

export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

async function resolveUser(req: Request): Promise<Authed | null> {
  const jwt = bearerToken(req);
  if (!jwt) return null;
  const client = userClient(req);
  // Explicit getUser(jwt): asks Supabase Auth to validate the token and returns the live user record.
  const { data, error } = await client.auth.getUser(jwt);
  if (error) {
    // 4xx from Auth = bad/expired token or the anon/publishable key. Anything else is an outage: refuse loudly.
    if (error.status && error.status >= 400 && error.status < 500) return null;
    throw new HttpError(500, `auth.getUser failed: ${error.status ?? '?'} ${error.message}`);
  }
  return data.user ? { user: data.user, client, jwt } : null;
}

/** Signed-in user or 401. */
export async function requireUser(req: Request): Promise<Authed> {
  const authed = await resolveUser(req);
  if (!authed) throw new HttpError(401, 'Sign in required');
  return authed;
}

/** Signed-in user or null (for the public `share` endpoint, which answers "needs code" instead of 401-by-throw). */
export function optionalUser(req: Request): Promise<Authed | null> {
  return resolveUser(req);
}

/** 403 unless the caller holds `cap` on the project (has_capability reads role_permissions; no role names here). */
export async function requireCapability(client: Db, projectId: string, cap: string): Promise<void> {
  const allowed = await rpc<boolean>(client, 'has_capability', { p_project_id: projectId, p_cap: cap });
  if (allowed !== true) throw new HttpError(403, `Not allowed (${cap})`);
}

/**
 * 403 unless the session is two-factor. The JWT was already verified by requireUser (getUser); here we only read the
 * `aal` claim from its payload, and check it belongs to the same user.
 */
export function requireAal2(user: User, req: Request): void {
  if (sessionClaims(user, req).aal !== 'aal2') throw new HttpError(403, 'aal2_required');
}

interface SessionClaims {
  sub?: unknown;
  aal?: unknown;
  /** Supabase: [{ method: 'otp' | 'password' | 'totp' | …, timestamp: <unix seconds> }] — when THIS session authenticated. */
  amr?: unknown;
}

/** Payload of the caller's JWT (already verified by requireUser/getUser); checked to belong to `user`. */
function sessionClaims(user: User, req: Request): SessionClaims {
  const jwt = bearerToken(req);
  if (!jwt) throw new HttpError(401, 'Sign in required');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Malformed session token');
  let claims: SessionClaims;
  try {
    claims = JSON.parse(base64UrlToText(parts[1])) as SessionClaims;
  } catch (e) {
    throw new HttpError(401, `Malformed session token: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (claims.sub !== user.id) throw new HttpError(401, 'Session token does not match user');
  return claims;
}

export const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

/**
 * Signing re-confirmation, Phase 1 form (SPEC §6.9: "a fresh sign-in within 5 minutes also counts").
 * True only when the account's last sign-in (live user record) is within 5 minutes AND, when the token carries `amr`,
 * this very session authenticated within 5 minutes — so a fresh sign-in on another device doesn't vouch for this one.
 */
export function signedInRecently(user: User, req: Request, now = Date.now()): boolean {
  const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  if (!Number.isFinite(last) || now - last > RECENT_SIGN_IN_MS || last - now > 60_000) return false;
  const amr = sessionClaims(user, req).amr;
  if (!Array.isArray(amr)) return true;
  return amr.some((m: unknown) => {
    const ts = (m as { timestamp?: unknown } | null)?.timestamp;
    return typeof ts === 'number' && now - ts * 1000 <= RECENT_SIGN_IN_MS;
  });
}

/** Cron callers send `x-cron-secret: $CRON_SECRET`. A missing secret on the server refuses (env() throws). */
export async function requireCron(req: Request): Promise<void> {
  const expected = env('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  if (!got || !(await safeEqual(got, expected))) throw new HttpError(401, 'Invalid cron secret');
}

export type WebhookProvider = 'resend';

export interface WebhookMeta {
  /** The sender's unique id for this delivery (Svix `svix-id`); the same across retries, so it is the dedupe key. */
  eventId: string;
}

const WEBHOOK_TOLERANCE_SEC = 5 * 60;

/** Decodes `whsec_<base64>` (the prefix is optional) to the HMAC key bytes. A bad secret refuses the request. */
function svixKey(secret: string): Uint8Array {
  try {
    const key = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret);
    if (key.length === 0) throw new Error('empty key');
    return key;
  } catch (e) {
    throw new HttpError(500, `Server misconfigured: RESEND_WEBHOOK_SECRET is not valid base64 (${e instanceof Error ? e.message : String(e)})`);
  }
}

/**
 * Webhooks (SPEC §6.4 #5, #6). Resend signs every webhook with Svix: HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${rawBody}`, keyed by RESEND_WEBHOOK_SECRET, sent as space-separated `v1,<base64>`
 * entries in `svix-signature`. The timestamp must be within 5 minutes either way (replay window).
 *
 * `rawBody` must be the exact bytes received, read ONCE by the caller (readBody) and parsed only after this passes.
 * Every candidate signature is compared in constant time; none short-circuit.
 */
export async function requireWebhook(req: Request, provider: WebhookProvider, rawBody: string): Promise<WebhookMeta> {
  switch (provider) {
    case 'resend': {
      const key = svixKey(env('RESEND_WEBHOOK_SECRET'));
      const id = req.headers.get('svix-id') ?? '';
      const ts = req.headers.get('svix-timestamp') ?? '';
      const header = req.headers.get('svix-signature') ?? '';
      if (!id || id.length > 200 || !/^\d{1,12}$/.test(ts) || !header) throw new HttpError(401, 'Invalid webhook signature');
      const age = Math.floor(Date.now() / 1000) - Number(ts);
      if (Math.abs(age) > WEBHOOK_TOLERANCE_SEC) throw new HttpError(401, 'Webhook timestamp outside tolerance');

      const expected = await hmacSha256Base64(key, `${id}.${ts}.${rawBody}`);
      const candidates = header.split(' ').filter((p) => p.startsWith('v1,')).map((p) => p.slice(3)).slice(0, 10);
      const matches = await Promise.all(candidates.map((c) => safeEqual(c, expected)));
      if (!matches.includes(true)) throw new HttpError(401, 'Invalid webhook signature');
      return { eventId: id };
    }
  }
}
