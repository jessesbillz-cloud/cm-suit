// Service-role Supabase client for the worker. The worker is a queue consumer, one of the places the service key is allowed.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorkerEnv } from './env.js';

// The worker validates every row it reads with zod (see lib/files.ts), so the client itself is untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any, any, any>;

export function createServiceClient(env: Pick<WorkerEnv, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, any, any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Turn a Supabase `{ error }` into a thrown error; return the data as `unknown` for zod to parse. */
export function checked(res: { data: unknown; error: { message: string } | null }, what: string): unknown {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
