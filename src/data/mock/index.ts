// The e2e mock switch. ONE place decides whether the data layer uses in-memory fixtures:
// the build must be made with VITE_E2E_MOCK=true AND the page must have localStorage['e2e-mock-user'] set
// (the Playwright tap-budget contract in tests/e2e/tap-budgets.spec.ts). Everything else is the real backend.
import type { AppUser } from '../types';

const MOCK_USER_KEY = 'e2e-mock-user';

/** Fixed when the app is built: false in every real build. */
const MOCK_BUILD = import.meta.env.VITE_E2E_MOCK === 'true';

// One expression on purpose: the bundler can then see isMock() is always false in a real build and leaves every
// mock module (fixtures, seeds) out of what users download. Two `return`s would hide that.
export function isMock(): boolean {
  return MOCK_BUILD && window.localStorage.getItem(MOCK_USER_KEY) !== null;
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
