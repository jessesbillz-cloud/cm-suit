// Mock two-step login, used only when isMock() is true. Enrolling makes a synthetic QR and key, any six digits
// verify, and the mock session then reads as aal2 (kept in sessionStorage like the rest of the mock state).
import { DataError } from '../errors';
import type { Enrollment, MfaStatus } from '../mfa';
import { delay, readMock, writeMock } from './store';

const FACTOR_ID = 'mock-factor-1';
const SECRET = 'SAMPLEKEYSAMPLEKEYSAMPLE';
// The same shape supabase-js hands back: a raw SVG behind the utf-8 data prefix (see lib/twoStep qrImageSrc).
const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff"/>' +
  '<path d="M8 8h16v16H8zM40 8h16v16H40zM8 40h16v16H8zM30 30h8v8h-8zM44 44h12v12H44z" fill="#111"/></svg>';

export async function status(): Promise<MfaStatus> {
  await delay();
  const m = readMock().mfa;
  return { level: m.level, factorId: m.verified ? m.factorId : null };
}

export async function enroll(): Promise<Enrollment> {
  await delay();
  writeMock((s) => ({ ...s, mfa: { factorId: FACTOR_ID, verified: false, level: s.mfa.level } }));
  return { factorId: FACTOR_ID, qrCode: `data:image/svg+xml;utf-8,${QR_SVG}`, secret: SECRET };
}

export async function verify(factorId: string, code: string): Promise<void> {
  await delay();
  if (readMock().mfa.factorId !== factorId) throw new DataError('That authenticator is gone. Reload.', 'mfa_factor_not_found', null);
  if (!/^\d{6}$/.test(code)) throw new DataError("That code didn't work. Try the newest one.", 'mfa_verification_failed', null);
  writeMock((s) => ({ ...s, mfa: { factorId, verified: true, level: 'aal2' } }));
}

export async function unenroll(factorId: string): Promise<void> {
  await delay();
  const m = readMock().mfa;
  if (m.factorId !== factorId) throw new DataError('That authenticator is gone. Reload.', 'mfa_factor_not_found', null);
  if (m.verified && m.level !== 'aal2') throw new DataError('Enter a code from your authenticator app first.', 'insufficient_aal', null);
  writeMock((s) => ({ ...s, mfa: { factorId: null, verified: false, level: 'aal1' } }));
}

/** Pricing access in the mock: the bidder never; everyone else once the mock session is aal2. */
export function pricingAccess(isBidder: boolean): 'yes' | 'two_factor' | 'no' {
  if (isBidder) return 'no';
  return readMock().mfa.level === 'aal2' ? 'yes' : 'two_factor';
}
