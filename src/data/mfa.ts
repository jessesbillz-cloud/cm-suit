// Two-step login (TOTP) through Supabase Auth MFA. Pricing capabilities need an aal2 session (SPEC §5.2): the
// database returns bid prices and AI findings only after a code from the authenticator app was verified, so
// every verify here ends by refetching what RLS answers differently at aal2.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AuthError } from '@supabase/supabase-js';
import { FUTURE_NAME } from '../lib/brand';
import { supabase } from './client';
import { DataError } from './errors';
import { qk } from './keys';
import * as mockMfa from './mock/mfa';
import { isMock } from './mock';

export interface MfaStatus {
  /** aal2 once a code was verified in this session. */
  level: 'aal1' | 'aal2';
  /** The verified authenticator, or null while two-step login is off. */
  factorId: string | null;
}

export interface Enrollment {
  factorId: string;
  /** An SVG data URL; show it through lib/twoStep qrImageSrc. */
  qrCode: string;
  /** The same key as text, for typing into the app by hand. */
  secret: string;
}

/** Supabase refuses a second factor with the same friendly name, so an abandoned enrollment is removed first. */
const FACTOR_NAME = `${FUTURE_NAME} authenticator`;

const SHORT_MESSAGES: Record<string, string> = {
  mfa_verification_failed: "That code didn't work. Try the newest one.",
  mfa_verification_rejected: "That code didn't work. Try the newest one.",
  mfa_challenge_expired: 'That took too long. Try again.',
  mfa_factor_not_found: 'That authenticator is gone. Reload.',
  mfa_factor_name_conflict: 'An authenticator is already set up. Reload.',
  too_many_enrolled_mfa_factors: 'Too many authenticators on this account.',
  insufficient_aal: 'Enter a code from your authenticator app first.',
  over_request_rate_limit: 'Too many tries. Wait a minute.',
};

function mfaError(e: AuthError): DataError {
  const code = e.code ?? (e.status === 429 ? 'over_request_rate_limit' : null);
  const short = code !== null ? SHORT_MESSAGES[code] : undefined;
  return new DataError(short ?? e.message, code, e.message);
}

/** Every Auth { error } becomes a thrown DataError (CLAUDE.md rule 6). */
function unwrap<T>(res: { data: T | null; error: AuthError | null }): T {
  if (res.error) throw mfaError(res.error);
  if (res.data === null) throw new DataError('Two-step login did not answer. Try again.', null, null);
  return res.data;
}

async function fetchStatus(): Promise<MfaStatus> {
  if (isMock()) return mockMfa.status();
  // listFactors asks the server for the user, so it is fresh; the level comes from this session's token.
  const factors = unwrap(await supabase.auth.mfa.listFactors());
  const aal = unwrap(await supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  return { level: aal.currentLevel === 'aal2' ? 'aal2' : 'aal1', factorId: factors.totp[0]?.id ?? null };
}

/** Is this session aal2, and is two-step login on? Asked by the settings card and the step-up prompt. */
export function useMfaStatus() {
  return useQuery({ queryKey: qk.mfa, queryFn: fetchStatus, staleTime: 60_000 });
}

async function enroll(): Promise<Enrollment> {
  if (isMock()) return mockMfa.enroll();
  const factors = unwrap(await supabase.auth.mfa.listFactors());
  for (const f of factors.all) {
    if (f.factor_type === 'totp' && f.status === 'unverified') unwrap(await supabase.auth.mfa.unenroll({ factorId: f.id }));
  }
  const data = unwrap(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: FACTOR_NAME, issuer: FUTURE_NAME }));
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Challenge + verify. Verifies a fresh enrollment and steps an existing factor up to aal2 the same way. */
async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  if (isMock()) return mockMfa.verify(factorId, code);
  const challenge = unwrap(await supabase.auth.mfa.challenge({ factorId }));
  unwrap(await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code }));
}

async function unenroll(factorId: string): Promise<void> {
  if (isMock()) return mockMfa.unenroll(factorId);
  unwrap(await supabase.auth.mfa.unenroll({ factorId }));
  // Auth drops the session to aal1 on its side; a fresh token makes this one match at once.
  const { error } = await supabase.auth.refreshSession();
  if (error) throw mfaError(error);
}

/** The session's level changed: everything RLS answers differently at aal2 is refetched, no reload needed. */
async function refreshAfterLevelChange(qc: QueryClient): Promise<void> {
  await qc.invalidateQueries({ queryKey: qk.mfa });
  await Promise.all(qk.aal2Dependent.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Starts enrollment: the QR and key to put into the authenticator app, then useVerifyTotp with its code. */
export function useEnrollTotp() {
  return useMutation({ mutationFn: enroll });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { factorId: string; code: string }) => challengeAndVerify(input.factorId, input.code),
    onSuccess: () => refreshAfterLevelChange(qc),
  });
}

/** Turns two-step login off. Auth allows it only from an aal2 session; the card steps up first when needed. */
export function useUnenrollTotp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: unenroll, onSuccess: () => refreshAfterLevelChange(qc) });
}
