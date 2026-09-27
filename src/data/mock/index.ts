// The e2e mock switch. ONE place decides whether the data layer uses in-memory fixtures:
// the build must be made with VITE_E2E_MOCK=true AND the page must have localStorage['e2e-mock-user'] set
// (the Playwright tap-budget contract in tests/e2e/tap-budgets.spec.ts). Everything else is the real backend.
import type { AppUser } from '../types';

const MOCK_USER_KEY = 'e2e-mock-user';

export function isMock(): boolean {
  if (import.meta.env.VITE_E2E_MOCK !== 'true') return false;
  return window.localStorage.getItem(MOCK_USER_KEY) !== null;
}

/** The signed-in mock user, derived from the localStorage value (e.g. 'pm'). Synthetic by construction. */
export function mockUser(): AppUser {
  const who = window.localStorage.getItem(MOCK_USER_KEY) ?? 'user';
  return { id: `mock-user-${who}`, email: `${who}@example.test` };
}

/** Signing out of the mock clears the switch, so the app returns to the real (signed-out) sign-in screen. */
export function clearMockUser(): void {
  window.localStorage.removeItem(MOCK_USER_KEY);
}
