// The sub directory in the Bids tool (SPEC §11.2), against the e2e mock (five synthetic "Sample" subs in the mock
// company). Find narrows the list, the package filter uses the job's packages, and a row opens in the right column
// with the CSLB lookup link and the sub's history.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('sub directory (SPEC §11.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('find a sub, filter by package, open it', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=subs');
    const rows = page.getByTestId('sub-row');
    await expect(rows).toHaveCount(5);

    await page.getByTestId('subs-find').fill('drywall');
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('subs-count')).toHaveText('1 of 5');

    await page.getByTestId('subs-find').fill('');
    await page.getByTestId('subs-package').selectOption('03A');
    await expect(rows).toHaveCount(2);

    await rows.filter({ hasText: 'Sample Concrete Co' }).click();
    const pane = page.getByTestId('sub-pane');
    await expect(pane.getByTestId('sub-company')).toHaveValue('Sample Concrete Co');
    await expect(pane.getByRole('link', { name: 'Check license' })).toHaveAttribute('href', /LicNum=100001$/);
    await expect(pane.getByText('Checked')).toBeVisible();
    await expect(pane.getByTestId('sub-history').getByRole('listitem')).toHaveCount(2);
  });

  test('Add sub opens the small form', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=subs');
    await page.getByRole('button', { name: 'Add sub' }).click();
    await expect(page.getByTestId('new-sub-company')).toBeFocused();
    await expect(page.getByTestId('new-sub-trades')).toBeVisible();
  });
});
