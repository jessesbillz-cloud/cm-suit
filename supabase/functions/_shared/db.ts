// Supabase clients and the one way to turn a database `{ error }` into a thrown HttpError (CLAUDE.md rule 6).
//
// serviceClient() bypasses RLS. Only these may call it (scripts/hygiene.mjs enforces it):
//   - cron jobs, webhooks and the public endpoints of SPEC §6.4;
//   - admin functions listed in supabase/tests/admin_service_key_allowlist.txt, which call requireCapability first.
// Shared helpers (email.ts, audit.ts, ratelimit.ts, ai.ts) never create one; they take the client as a parameter.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.47.0';
import { env } from './env.ts';
import { HttpError } from './http.ts';

export type Db = SupabaseClient;
export type { User };

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** A client that acts as the caller: anon key + the caller's Authorization header, so RLS applies. */
export function userClient(req: Request): Db {
  const authorization = req.headers.get('authorization');
  if (!authorization) throw new HttpError(401, 'Sign in required');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: NO_SESSION,
    global: { headers: { Authorization: authorization } },
  });
}

/** Service-role client. Bypasses RLS. See the allowlist rule at the top of this file. */
export function serviceClient(): Db {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: NO_SESSION });
}

interface PgErrorLike {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/** Postgres / PostgREST error code → HTTP status. */
export function pgStatus(code: string | undefined): number {
  switch (code) {
    case '42501': return 403; // insufficient_privilege (our RPCs raise this for "forbidden")
    case 'P0002': return 404; // no_data_found
    case 'PGRST116': return 404; // .single() found no row
    case '40001': return 409; // version conflict (assert_version)
    case '23505': return 409; // unique violation
    case 'PGRST301': return 401; // JWT rejected by PostgREST
    default: break;
  }
  if (!code) return 500;
  // P0001 = plain `raise exception`; 22xxx data exceptions; 23xxx other integrity violations: the caller sent bad input.
  if (code === 'P0001' || code.startsWith('22') || code.startsWith('23')) return 400;
  return 500;
}

/** Converts a PostgREST error into an HttpError. 5xx messages are logged by handle(), never shown to the caller. */
export function dbError(error: PgErrorLike, context: string): HttpError {
  const status = pgStatus(error.code);
  if (status === 409 && error.code === '23505') return new HttpError(409, 'Already exists');
  if (status >= 500) return new HttpError(500, `${context}: ${error.code ?? '?'} ${error.message}`);
  return new HttpError(status, error.message, error.details ?? undefined);
}

/** Calls an RPC and throws on `{ error }`. */
export async function rpc<T>(client: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw dbError(error, `rpc ${fn}`);
  return data as T;
}

/** Unwraps a table query result and throws on `{ error }`. */
export function must<T>(res: { data: T | null; error: PgErrorLike | null }, context: string): T {
  if (res.error) throw dbError(res.error, context);
  return res.data as T;
}

/** Storage API errors are always server-side problems from the caller's point of view. */
export function storageError(error: { message: string }, context: string): HttpError {
  return new HttpError(500, `${context}: ${error.message}`);
}

/** Creates a ~10 minute signed download URL that keeps the original filename (SPEC §6.5). */
export async function signedDownloadUrl(service: Db, bucket: string, path: string, filename: string): Promise<string> {
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 600, { download: filename });
  if (error || !data) throw storageError(error ?? { message: 'no signed url' }, 'createSignedUrl');
  return data.signedUrl;
}
