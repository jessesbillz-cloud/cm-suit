// Files: a job opens with the folders its company kind uses most, in that order (migration 0027), an empty
// "Emailed in" stays out of the tree, and a new folder asks one question. Runs only against the e2e mock data layer.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Signs in as a mock user on the desktop layout (the phone shell has its own Files screens). */
async function signIn(page: Page, who: string): Promise<void> {
  test.skip(test.info().project.name !== 'desktop', 'Uses the desktop rail.');
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto('/');
}

test.describe('files: folders by who uses them', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a GC job lists Plans first and Photos last; an empty Emailed in is hidden', async ({ page }) => {
    await signIn(page, 'pm');
    await page.getByTestId('rail-files').click();
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Bids received', 'Reports', 'Photos']);
    await expect(page.getByTestId('folder').first()).toHaveAttribute('aria-current', 'true');
  });

  test('a new folder asks whether search and the AI read it (on by default), and it can change later', async ({ page }) => {
    await signIn(page, 'pm');
    await page.getByTestId('rail-files').click();
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByTestId('new-folder-name').fill('Sample submittals');
    const ask = page.getByTestId('new-folder-ai-reads');
    await expect(ask).toBeChecked();
    await ask.uncheck();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Bids received', 'Reports', 'Photos', 'Sample submittals']);
    const toggle = page.getByTestId('folder-ai-reads');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
  });

  test("an inspector's DSA job opens with Plans, Specs, DSA 103 and CCDs", async ({ page }) => {
    await signIn(page, 'newcomer');
    await page.getByTestId('setup-company-name').fill('Sample Inspection Co');
    await page.getByLabel('Type').selectOption('inspector');
    await page.getByTestId('setup-company-next').click();
    await page.getByTestId('setup-job-name').fill('Sample School');
    await page.getByTestId('setup-job-dsa').check();
    await page.getByTestId('setup-job-create').click();
    await expect(page.getByTestId('main-area')).toBeVisible();

    await page.getByTestId('rail-files').click();
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'DSA 103', 'CCDs', 'Reports', 'Photos']);
  });
});
