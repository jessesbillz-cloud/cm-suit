// Bid packages with CSI spec sections (SPEC §11.2), against the e2e mock. A new package starts from its division: the
// code (next free letter there) and the name (the division's title) fill in; sections are found by number or title
// and sit as chips; Add saves and opens it. The database's rule that a code is used once per job holds in the mock.
// Contract with the mock: 'pm' manages bids on Sample Job A, whose packages are 03A and 09A (09 21 16, 09 29 00).
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('bid packages and spec sections (SPEC §11.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The list and the right column side by side is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the list shows each package\'s sections', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=packages');
    await expect(page.getByTestId('package-row-09A')).toContainText('09 21 16 · 09 29 00');
    await expect(page.getByTestId('package-row-03A')).toContainText('03 30 00');
  });

  test('a new package: pick the division, the code and name fill in, add a section, save', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=packages');
    await page.getByTestId('package-add').click();
    const form = page.getByTestId('new-package-form');
    await expect(form).toBeVisible();

    await form.getByTestId('package-division').selectOption('26');
    await expect(form.getByTestId('package-code')).toHaveValue('26A');
    await expect(form.getByTestId('package-name')).toHaveValue('Electrical');

    // 09A is taken on this job, so Division 09 suggests 09B.
    await form.getByTestId('package-division').selectOption('09');
    await expect(form.getByTestId('package-code')).toHaveValue('09B');
    await expect(form.getByTestId('package-name')).toHaveValue('Finishes');

    const search = form.getByTestId('package-section-search');
    await search.fill('gyp');
    await expect(form.getByTestId('section-option-09 29 00')).toBeVisible();
    await form.getByTestId('section-option-09 21 16').click();
    await expect(form.getByTestId('section-chip-09 21 16')).toContainText('Gypsum Board Assemblies');
    await expect(form.getByTestId('section-option-09 21 16')).toHaveCount(0);

    // By number, and outside the division once "All" is on.
    await search.fill('0922');
    await form.getByTestId('section-option-09 22 16').click();
    await form.getByTestId('section-scope-all').click();
    await search.fill('wet pipe');
    await form.getByTestId('section-option-21 13 13').click();
    await expect(form.getByTestId('section-chip-21 13 13')).toBeVisible();
    await form.getByRole('button', { name: 'Remove 21 13 13' }).click();
    await expect(form.getByTestId('section-chip-21 13 13')).toHaveCount(0);

    await form.getByTestId('package-save').click();
    await expect(page).toHaveURL(/\/p\/job-a\/bids\/pkg-new-\d+\?view=packages$/);
    await expect(page.getByTestId('package-form').getByTestId('package-code')).toHaveValue('09B');
    await expect(page.getByTestId('package-form').getByTestId('section-chip-09 22 16')).toBeVisible();
    const row = page.getByTestId('package-row-09B');
    await expect(row).toContainText('Finishes');
    await expect(row).toContainText('09 21 16 · 09 22 16');
  });

  test('a code already used on the job is refused', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=packages');
    await page.getByTestId('package-add').click();
    const form = page.getByTestId('new-package-form');
    await form.getByTestId('package-code').fill('09A');
    await form.getByTestId('package-save').click();
    await expect(form.getByRole('alert')).toHaveText('09A is taken.');
  });

  test('picking a section on an existing package saves it', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=packages');
    await page.getByTestId('package-row-09A').click();
    const form = page.getByTestId('package-form');
    await expect(form.getByTestId('section-chip-09 29 00')).toBeVisible();
    await form.getByTestId('package-section-search').fill('non-structural');
    await form.getByTestId('section-option-09 22 16').click();
    await expect(form.getByText('Saved')).toBeVisible();
    await expect(page.getByTestId('package-row-09A')).toContainText('09 21 16 · 09 22 16 · 09 29 00');
  });
});
