// Daily reports (SPEC §13.1), against the e2e mock data layer: today's report is waiting, a note autosaves ("Saved"),
// and Submit signs it (the mock stands in for submit-daily) with the database's number and the setup's filename. The
// tool's main button then reads "Edit submitted". A company form (SPEC §8.3, the VIS daily report) on a company whose
// setting names it: its job values in Setup, its day's fields in the editor, its own numbering and filename.
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
    await expect(setup.getByTestId('daily-form')).toHaveValue('daily');
    await expect(setup.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Daily Report');
    await expect(setup.getByTestId('daily-filename-preview')).toContainText(/^Daily Report 1 Sample Job A \d{2}-\d{2}-\d{4}\.pdf$/);
  });

  // Contract with the mock: job-v ("Sample School Wing", S-400, a DSA job) belongs to Sample Inspection Co, whose
  // orgs.settings.report_generator is 'vis_daily' (data/mock/formJobs).
  test('a company form (VIS): job info prefilled in Setup, the number continues, the report files as DR_233_...', async ({ page }) => {
    await page.goto('/p/job-v/dailies');
    await expect(page.getByTestId('daily-today')).toBeVisible();
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-form')).toHaveValue('vis_daily');
    await expect(setup.getByTestId('job-field-project_name')).toHaveValue('Sample School Wing');
    await expect(setup.getByTestId('job-field-project_no')).toHaveValue('S-400');
    await expect(setup.getByTestId('job-field-jurisdiction')).toHaveValue('DSA');
    await setup.getByTestId('job-field-architect').fill('Sample Architects');
    await setup.getByTestId('job-field-architect').blur();
    await expect(setup.getByText('Saved', { exact: true })).toBeVisible();
    const next = setup.getByTestId('daily-next-number');
    await next.fill('233');
    await next.blur();
    await expect(setup.getByTestId('daily-filename-preview')).toHaveText(/^DR_233_Sample_School_Wing_\d{4}-\d{2}-\d{2}\.pdf$/);

    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor).toContainText('will be #233');
    await expect(editor.getByTestId('form-field-correction_notices')).toBeVisible();
    await editor.getByTestId('form-field-contractor_activity').fill('Sample framing, level 2');
    await editor.getByTestId('form-field-ior_notes').fill('SAMPLE FRAMING\nObserved sample framing at level 2.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();

    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done).toContainText(/DR_233_Sample_School_Wing_\d{4}-\d{2}-\d{2}\.pdf/);
    await expect(page.getByTestId('daily-row').first()).toContainText('#233');
  });

  test('switching the form in Setup keeps each form\'s own setup', async ({ page }) => {
    await page.goto('/p/job-v/dailies');
    await expect(page.getByTestId('daily-today')).toBeVisible();
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-job-fields')).toBeVisible();
    await setup.getByTestId('daily-form').selectOption('daily');
    await expect(setup.getByTestId('daily-job-fields')).toHaveCount(0);
    await expect(setup.getByTestId('daily-filename-preview')).toContainText(/^Daily Report 1 Sample School Wing/);
    await setup.getByTestId('daily-form').selectOption('vis_daily');
    await expect(setup.getByTestId('job-field-project_name')).toHaveValue('Sample School Wing');
  });
});
