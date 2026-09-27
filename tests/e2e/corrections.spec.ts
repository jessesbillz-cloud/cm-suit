// Corrections log (SPEC §13.4) against the e2e mock: an inspector opens CN-001, a sub marks it ready with a note,
// the inspector signs it off. The mock follows the database's rule that only corrections.close decides, so the sub
// never sees Sign off and the inspector never sees Mark ready. Mock users: 'inspector' and 'sub'.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Switches the mock user and opens the log. The mock's data stays in this tab's sessionStorage. */
async function openLogAs(page: Page, who: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto('/p/job-a/corrections');
}

test.describe('corrections log (SPEC §13.4)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.skip(({ isMobile }) => isMobile, 'The right column is the desktop frame.');

  test('inspector opens CN-001, a sub marks it ready, the inspector signs it off', async ({ page }) => {
    await page.goto('/');

    // Inspector: a new item gets CN-001 from the numbering, and opens on the right.
    await openLogAs(page, 'inspector');
    await expect(page.getByText('No corrections yet.')).toBeVisible();
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample firestop gap at duct');
    await page.getByTestId('cn-trade').fill('Sample Drywall');
    await page.getByTestId('cn-location').fill('Level 2 corridor');
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('log-row-CN-001')).toBeVisible();
    await expect(page.getByTestId('cn-status')).toHaveText('Open');

    // Sub: marks it ready with a note. No inspector steps offered.
    await openLogAs(page, 'sub');
    await page.getByTestId('log-row-CN-001').click();
    await expect(page.getByTestId('cn-step-ready')).toBeVisible();
    await expect(page.getByTestId('cn-step-signed_off')).toHaveCount(0);
    await expect(page.getByTestId('cn-new')).toHaveCount(0);
    await page.getByTestId('cn-step-ready').click();
    await page.getByTestId('cn-step-note').fill('Sealed per sample detail');
    await page.getByTestId('cn-step-confirm').click();
    await expect(page.getByTestId('cn-status')).toHaveText('Ready');

    // Inspector: reads the sub's note and signs off.
    await openLogAs(page, 'inspector');
    await page.getByTestId('log-row-CN-001').click();
    await expect(page.getByTestId('cn-latest')).toContainText('Sealed per sample detail');
    await expect(page.getByTestId('cn-step-ready')).toHaveCount(0);
    await page.getByTestId('cn-step-signed_off').click();
    await page.getByTestId('cn-step-confirm').click();
    await expect(page.getByTestId('cn-status')).toHaveText('Signed off');

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByTestId('cn-history').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByTestId('log-row-CN-001')).toContainText('Signed off');
  });
});
