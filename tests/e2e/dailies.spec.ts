// Daily reports (SPEC §13.1), against the e2e mock data layer: today's report is waiting, a note autosaves ("Saved"),
// and Submit signs it (the mock stands in for submit-daily) with the database's number and the setup's filename. The
// tool's main button then reads "Edit submitted".
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('dailies (SPEC §13.1)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test("start today's report, type a note, see Saved, submit", async ({ page }) => {
    await page.goto('/p/job-a/dailies');
    const today = page.getByTestId('daily-today');
    await expect(today).toHaveText('Start');
    await today.click();

    const editor = page.getByTestId('daily-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('will be #1');
    await editor.getByTestId('note-general').fill('Sample note for the day.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await expect(today).toHaveText('Continue');

    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done).toBeVisible();
    await expect(done).toContainText(/Daily Report 1 Sample Job A \d{2}-\d{2}-\d{4}\.pdf/);
    await expect(done.getByTestId('daily-download')).toBeEnabled();
    await expect(today).toHaveText('Edit submitted');
    await expect(page.getByTestId('daily-row').first()).toContainText('#1');
  });

  test('setup opens from the tool header, prefilled', async ({ page }) => {
    await page.goto('/p/job-a/dailies');
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Daily Report');
    await expect(setup.getByTestId('daily-filename-preview')).toContainText(/^Daily Report 1 Sample Job A \d{2}-\d{2}-\d{4}\.pdf$/);
  });
});
