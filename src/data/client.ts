// The one Supabase client. Standard supabase-js sessions; no hand-rolled refresh (SPEC §6.6).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

export const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_KEY = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Sign-in is by email code only; there are no auth redirects to parse.
    detectSessionInUrl: false,
  },
});

/** The current access token, refreshed by supabase-js when needed. Throws when signed out. */
export async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('You are signed out. Sign in again to continue.');
  return data.session.access_token;
}
