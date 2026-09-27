// Smoke (SPEC §9.1): runs in CI and against staging after every deploy. A fresh browser must reach the sign-in
// screen with no console errors. Mock or real data layer both work: a new context has no session.
import { expect, test, type ConsoleMessage } from '@playwright/test';

test('app loads and shows the sign-in screen without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err: Error) => {
    errors.push(`pageerror: ${err.message}`);
  });

  const res = await page.goto('/');
  expect(res?.ok(), `GET / returned ${String(res?.status())}`).toBe(true);

  // Email one-time-code sign-in (SPEC §10): an email field and a button to continue.
  await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in|send( me a)? code|continue/i })).toBeVisible();

  await page.waitForLoadState('networkidle');
  expect(errors, errors.join('\n')).toEqual([]);
});
