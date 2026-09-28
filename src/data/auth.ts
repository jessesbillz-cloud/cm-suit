// Email one-time codes only (SPEC §10.3): no passwords, no magic links (scanners burn them, SPEC §6.4).
import { createContext, useContext } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { detectZone } from '../lib/dates';
import { DataError, throwIfErrorMaybe, toDataError } from './errors';
import { callFunction } from './functions';
import { clearMockUser, isMock } from './mock';
import type { AppUser } from './types';

export interface SessionState {
  status: 'loading' | 'signed_out' | 'signed_in';
  user: AppUser | null;
  /** accept_invites() failed after sign-in; shown as a banner, never hidden. */
  inviteError: string | null;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** The signed-in user; throws when called on a screen that should not render signed out. */
export function useUser(): AppUser {
  const { user } = useSession();
  if (!user) throw new Error('This screen needs a signed-in user.');
  return user;
}

function authMessage(e: AuthError): DataError {
  const code = e.code ?? null;
  if (e.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return new DataError('Too many codes requested. Wait a minute, then try again.', code, e.message);
  }
  // The sign-in allowlist (migration 0016) refuses the new account; Auth reports it as a database error.
  if (e.message.includes('Database error saving new user')) {
    return new DataError("This email can't sign in here.", code, e.message);
  }
  if (code === 'otp_expired' || code === 'invalid_otp' || e.status === 403) {
    return new DataError('That code is wrong or has expired. Use the newest email, or send a new code.', code, e.message);
  }
  return new DataError(e.message, code, e.message);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sends the code email (Supabase Auth OTP through Resend SMTP). Creates the auth user if new. */
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw authMessage(error);
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: 'email' });
  if (error) throw authMessage(error);
}

const KeyLoginAnswer = z.object({ token_hash: z.string().regex(/^[0-9a-f]{20,128}$/) }).strict();

/**
 * Testing only (decisions.md, 0036): a personal sign-in link /k/<key> signs its owner in with no email and no code.
 * key-login turns the key into a one-time sign-in token on the spot; verifying it here starts the session.
 */
export async function signInWithKey(key: string): Promise<void> {
  const { token_hash } = await callFunction('key-login', { key }, KeyLoginAnswer);
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' });
  if (error) throw authMessage(error);
}

/** Binds pending invites for the signed-in email. Safe to repeat. Returns how many were accepted. */
export async function acceptInvites(): Promise<number> {
  if (isMock()) return 0;
  const n = throwIfErrorMaybe(await supabase.rpc('accept_invites')) ?? 0;
  await syncDetectedZone();
  return n;
}

/**
 * Time zone detection (CLAUDE.md rule 14): the browser's zone becomes the person's profile zone automatically.
 * Runs after every sign-in; the RPC only changes the profile when it was never set by hand.
 */
async function syncDetectedZone(): Promise<void> {
  const { error } = await supabase.rpc('sync_detected_timezone', { p_zone: detectZone() });
  if (error) throw toDataError(error);
}

async function clearIndexedDb(): Promise<void> {
  if (!('databases' in indexedDB)) return;
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs.map(
      (db) =>
        new Promise<void>((resolve, reject) => {
          if (!db.name) {
            resolve();
            return;
          }
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = () => {
            resolve();
          };
          // Another tab holding the database open: the delete completes when it closes. Don't wait for it.
          req.onblocked = () => {
            resolve();
          };
          req.onerror = () => {
            reject(req.error ?? new Error(`Could not clear ${db.name}`));
          };
        }),
    ),
  );
}

async function clearCacheStorage(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

function clearAppLocalStorage(): void {
  const doomed: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && (k.startsWith('app:') || k.startsWith('tus::'))) doomed.push(k);
  }
  for (const k of doomed) window.localStorage.removeItem(k);
}

/**
 * Sign out, then clear everything user-scoped on this device (SPEC §6.6): the query cache, IndexedDB (offline
 * queue), Cache Storage, and localStorage keys prefixed `app:` (plus resumable-upload URLs under `tus::`).
 * supabase-js removes its own session key.
 */
export async function signOut(queryClient: QueryClient): Promise<void> {
  if (isMock()) {
    clearMockUser();
    window.sessionStorage.clear();
  } else {
    const { error } = await supabase.auth.signOut();
    if (error) throw authMessage(error);
  }
  queryClient.clear();
  await Promise.all([clearIndexedDb(), clearCacheStorage()]);
  clearAppLocalStorage();
}
