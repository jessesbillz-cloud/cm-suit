// Required bid forms (SPEC §11.1) against the e2e mock data layer (VITE_E2E_MOCK=true): a prevailing-wage job opens
// with its public-works forms, attaching the bid bond marks it done and the Forms tab's missing count drops by one,
// and a removed form comes back with Undo.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const BOND = { name: 'Sample bid bond.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic bid bond') };

test.describe('bid forms (SPEC §11.1)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('attach the bid bond: it is done and the missing count drops', async ({ page }) => {
    // Sample Library Addition: a prevailing-wage job in bidding, so the 8 bid-time forms are missing.
    await page.goto('/p/job-p1/bids?view=forms');
    const count = page.getByTestId('bids-view-forms-count');
    await expect(count).toHaveText('8');
    await expect(page.getByTestId('forms-group-with_bid')).toBeVisible();
    await expect(page.getByTestId('forms-group-after_award')).toBeVisible();

    const bond = page.getByTestId('form-row-Bid bond');
    await expect(bond).toContainText('PCC §20111(b)');
    await expect(bond.getByText('To do', { exact: true })).toBeVisible();

    await bond.click();
    await page.getByTestId('form-attach-input').setInputFiles(BOND);
    await expect(page.getByTestId('form-status-done')).toHaveAttribute('aria-pressed', 'true');
    await expect(bond.getByText('Done', { exact: true })).toBeVisible();
    await expect(bond).toContainText('Sample bid bond.pdf');
    await expect(page.getByTestId('form-download-Bid bond')).toBeVisible();
    await expect(count).toHaveText('7');

    // Back to To do: missing again.
    await page.getByTestId('form-status-to_do').click();
    await expect(count).toHaveText('8');
  });

  test('a form added for this job can be removed and brought back', async ({ page }) => {
    await page.goto('/p/job-p1/bids?view=forms');
    await expect(page.getByTestId('bids-view-forms-count')).toHaveText('8');
    await page.getByTestId('forms-add').click();
    await page.getByTestId('new-form-name').fill('Sample owner site visit form');
    await page.getByTestId('new-form-add').click();
    const row = page.getByTestId('form-row-Sample owner site visit form');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('bids-view-forms-count')).toHaveText('9');

    await page.getByTestId('form-remove').click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row).toBeVisible();
    await expect(page.getByTestId('bids-view-forms-count')).toHaveText('9');
  });
});
