// The only auth gates for edge functions (SPEC §6.3). requireUser is the real gate; verify_jwt is a second layer.
import { HttpError } from './http.ts';
import { env } from './env.ts';
import { type Db, type User, rpc, userClient } from './db.ts';
import { base64UrlToText, safeEqual } from './crypto.ts';

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
  const jwt = bearerToken(req);
  if (!jwt) throw new HttpError(401, 'Sign in required');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Malformed session token');
  let claims: { sub?: unknown; aal?: unknown };
  try {
    claims = JSON.parse(base64UrlToText(parts[1]));
  } catch (e) {
    throw new HttpError(401, `Malformed session token: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (claims.sub !== user.id) throw new HttpError(401, 'Session token does not match user');
  if (claims.aal !== 'aal2') throw new HttpError(403, 'aal2_required');
}

/** Cron callers send `x-cron-secret: $CRON_SECRET`. A missing secret on the server refuses (env() throws). */
export async function requireCron(req: Request): Promise<void> {
  const expected = env('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  if (!got || !(await safeEqual(got, expected))) throw new HttpError(401, 'Invalid cron secret');
}

function basicCredentials(req: Request): { user: string; pass: string } | null {
  const m = /^Basic\s+(\S+)\s*$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  let decoded: string;
  try {
    decoded = atob(m[1]);
  } catch (e) {
    console.warn('webhook: undecodable Basic credentials', e instanceof Error ? e.message : String(e));
    return null;
  }
  const i = decoded.indexOf(':');
  return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

export type WebhookProvider = 'postmark';

/**
 * Webhooks (SPEC §6.4 #5, #6): Basic Auth credentials embedded in the webhook URL (https://user:pass@host/...), which
 * the sender turns into an Authorization: Basic header, PLUS a secret header. All comparisons run; none short-circuit.
 */
export async function requireWebhook(req: Request, provider: WebhookProvider): Promise<void> {
  switch (provider) {
    case 'postmark': {
      const user = env('POSTMARK_INBOUND_USER');
      const pass = env('POSTMARK_INBOUND_PASS');
      const secret = env('POSTMARK_WEBHOOK_SECRET');
      const creds = basicCredentials(req);
      const header = req.headers.get('x-webhook-secret') ?? '';
      const [u, p, s] = await Promise.all([
        safeEqual(creds?.user ?? '', user),
        safeEqual(creds?.pass ?? '', pass),
        safeEqual(header, secret),
      ]);
      if (!creds || !header || !(u && p && s)) throw new HttpError(401, 'Invalid webhook credentials');
      return;
    }
  }
}
