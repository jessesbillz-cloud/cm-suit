// Two-step login (TOTP) in Settings, against the e2e mock data layer (VITE_E2E_MOCK=true; see tap-budgets.spec.ts
// for the mock-user contract). The mock authenticator accepts any six digits.
//
// Test ids: two-step-status ("On" / "Off"), two-step-on, two-step-off, two-step-qr (the <img>), two-step-key,
// totp-code (the box), totp-verify.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('two-step login (SPEC §5.2 aal2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('turn on in Settings: QR and key, a code, then On; survives a reload; turn off', async ({ page }, testInfo) => {
    await page.goto('/p/job-a/settings');
    const status = page.getByTestId('two-step-status');
    await expect(status).toHaveText('Off');

    await page.getByTestId('two-step-on').click();
    const qr = page.getByTestId('two-step-qr');
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect(page.getByTestId('two-step-key')).toContainText('Key:');

    const code = page.getByTestId('totp-code');
    if (testInfo.project.name === 'desktop') await expect(code).toBeFocused();
    await code.fill('123456');
    await page.getByTestId('totp-verify').click();
    await expect(status).toHaveText('On');
    await expect(page.getByTestId('two-step-qr')).toHaveCount(0);

    // The mock session is now aal2 (sessionStorage), like the real token after a verify.
    await page.reload();
    await expect(page.getByTestId('two-step-status')).toHaveText('On');

    await page.getByTestId('two-step-off').click();
    await expect(page.getByTestId('two-step-status')).toHaveText('Off');
  });

  test('a wrong code is refused in place', async ({ page }) => {
    await page.goto('/p/job-a/settings');
    await page.getByTestId('two-step-on').click();
    const code = page.getByTestId('totp-code');
    await expect(code).toBeVisible();
    await code.fill('12');
    await page.getByTestId('totp-verify').click();
    await expect(page.getByRole('alert')).toContainText('6-digit');
    await expect(page.getByTestId('two-step-qr')).toBeVisible();
  });
});
