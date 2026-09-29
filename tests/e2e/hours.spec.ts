// Hours, timesheets and invoices (SPEC §15), against the e2e mock data layer: hours set after submitting a report
// (MDR's 0/2/4/6/8 prompt), the job's contract hours moving with them, the month's timesheet PDF, and an invoice
// (numbered by the mock database, PDF, Draft / Sent / Paid by hand).
// Contract with the mock: 'inspector' is on job-v ("Sample School Wing", an inspection company's job with Hours on,
// the VIS daily form); Hours is on the inspector's rail there and Timesheets on All my jobs. The mock user already has
// 8 submitted dailies on job-v before today, 56 hours in all (data/mock/hoursSeeds).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const SEEDED_HOURS = 56;

/** Today's report on job-v, submitted, with 8 hours from the prompt. */
async function submitTodayWithHours(page: Page): Promise<void> {
  await page.goto('/p/job-v/dailies');
  await page.getByTestId('daily-today').click();
  const editor = page.getByTestId('daily-editor');
  await editor.getByTestId('form-field-contractor_activity').fill('Sample framing, level 2');
  await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
  await editor.getByTestId('daily-submit').click();
  await expect(page.getByTestId('daily-submitted')).toBeVisible();
  const prompt = page.getByTestId('hours-prompt');
  await prompt.getByTestId('hours-chip-8').click();
  await expect(prompt.getByTestId('hours-chip-8')).toHaveAttribute('aria-pressed', 'true');
  await expect(prompt.getByTestId('hours-saved')).toBeVisible();
}

test.describe('hours, timesheets and invoices (SPEC §15)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Items open in the right column of the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'inspector');
    });
  });

  test("hours after submit; the job's contract hours move with them", async ({ page }) => {
    await submitTodayWithHours(page);

    await page.getByTestId('rail-hours').click();
    await expect(page).toHaveURL(/\/p\/job-v\/hours$/);
    await page.getByTestId('hours-contract-set').click();
    const form = page.getByTestId('hours-contract-form');
    await form.getByTestId('hours-contract-input').fill('4000');
    await form.getByTestId('hours-baseline-input').fill('300');
    await form.getByTestId('hours-through-input').fill('2020-01-01');
    await form.getByTestId('hours-contract-save').click();

    // Used = 300 before tracking + every report after Jan 1, 2020: the seeded 56 and today's 8.
    const used = 300 + SEEDED_HOURS + 8;
    await expect(page.getByTestId('hours-used')).toHaveText(String(used));
    await expect(page.getByTestId('hours-remaining')).toHaveText('3,636');

    // Today's day, newest first: down to 6 hours, and the budget follows.
    await page.getByTestId('hours-row').first().click();
    const day = page.getByTestId('hours-day');
    await expect(day.getByTestId('hours-chip-8')).toHaveAttribute('aria-pressed', 'true');
    await day.getByTestId('hours-chip-6').click();
    await expect(page.getByTestId('hours-used')).toHaveText(String(used - 2));

    await page.getByTestId('hours-view-months').click();
    await expect(page.getByTestId('hours-months')).toBeVisible();
  });

  test("the month's signed timesheet PDF, then an invoice from billing to paid", async ({ page }) => {
    await submitTodayWithHours(page);

    await page.goto('/all/timesheets');
    await expect(page.getByTestId('month-job').first()).toContainText('Sample School Wing');
    const timesheet = page.waitForEvent('download');
    await page.getByTestId('timesheet-sign').click();
    expect((await timesheet).suggestedFilename()).toMatch(/TIMESHEET/);

    // No billing yet: set it up (the rate is mine only), then the month's invoice, numbered by the database.
    await page.getByTestId('timesheets-billing').click();
    await page.getByTestId('billing-name').fill('Sample Inspection Services');
    await page.getByTestId('billing-rate').fill('90');
    await page.getByTestId('billing-save').click();
    await expect(page.getByTestId('invoice-new')).toBeVisible();
    await page.getByTestId('invoice-new').click();
    const invoice = page.getByTestId('invoice-item');
    await expect(invoice).toContainText('Invoice #1');
    await expect(invoice.getByTestId('invoice-total')).toContainText('$');
    await expect(page.getByTestId('invoice-row-1')).toBeVisible();
    // One invoice a month: the button to make another is gone.
    await expect(page.getByTestId('invoice-new')).toHaveCount(0);

    const pdf = page.waitForEvent('download');
    await invoice.getByTestId('invoice-pdf').click();
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);

    await invoice.getByTestId('invoice-status-paid').click();
    await expect(page.getByTestId('invoice-row-1')).toContainText('Paid');
    await invoice.getByTestId('invoice-status-draft').click();
    await expect(page.getByTestId('invoice-row-1')).toContainText('Draft');
  });
});
