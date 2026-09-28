// Calendar (SPEC §7.6) against the mock data layer: the week shows the job's lines, a person with calendar.manage adds
// a line from a day's "+", sees it in the week, deletes it, and Undo brings it back. Runs on desktop and phone.
// Contract with the mock: 'pm' manages the calendar on job-a; the mock has "Sample OAC meeting" on this week's Wednesday
// (meetings show by default); test ids cal-add-<day>, cal-day-<day>, cal-title, cal-save, cal-delete.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('calendar (SPEC §7.6)', () => {
  test.skip(!MOCK, 'Calendar e2e runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('add a line on a day, see it in the week, delete it and undo', async ({ page }) => {
    await page.goto('/p/job-a/calendar');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'calendar');
    await expect(page.getByText('Sample OAC meeting')).toBeVisible();

    // Wednesday's "+" (the third day of the week).
    const add = page.getByTestId(/^cal-add-\d{4}-\d{2}-\d{2}$/).nth(2);
    const addId = (await add.getAttribute('data-testid')) ?? '';
    const day = addId.replace('cal-add-', '');
    await add.click();

    await page.getByTestId('cal-title').fill('Sample crane day');
    await expect(page.getByTestId('cal-date')).toHaveValue(day);
    await page.getByTestId('cal-save').click();

    const column = page.getByTestId(`cal-day-${day}`);
    await expect(column).toContainText('Sample crane day');

    await column.getByRole('button', { name: /Sample crane day/ }).click();
    await page.getByTestId('cal-delete').click();
    await expect(page.getByTestId(`cal-day-${day}`)).not.toContainText('Sample crane day');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId(`cal-day-${day}`)).toContainText('Sample crane day');
  });

  test('the type toggles hide and show a kind', async ({ page }) => {
    await page.goto('/p/job-a/calendar');
    await expect(page.getByText('Sample OAC meeting')).toBeVisible();
    await page.getByTestId('cal-type-meetings').click();
    await expect(page.getByText('Sample OAC meeting')).toHaveCount(0);
    await page.getByTestId('cal-type-meetings').click();
    await expect(page.getByText('Sample OAC meeting')).toBeVisible();
  });
});
