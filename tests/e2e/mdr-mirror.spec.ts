// Requests copied from My Daily Reports (0112) against the e2e mock: the mock seeds IR 7 (approved) and IR 8 (not
// approved) on Sample Job B, 45 days back, both from MDR, neither IR PDF copied yet. They show wherever requests show,
// marked From MDR, and are view only: no step, no one-tap Confirm. 'pm' decides inspections on both sample jobs.
// Test ids: ir-queue-<n>, ir-from-mdr, right-column, ir-result-step, ir-generate, ir-confirm, cal-day-detail, cal-request,
// cal-line.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** The day `n` days from today in the jobs' zone (the mock places its requests the same way). */
function fromToday(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY = fromToday(-45);

test.describe('requests from My Daily Reports (0112)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('a copy is marked From MDR and has no steps', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto(`/p/job-b/inspections?view=day&day=${DAY}`);
    const row = page.getByTestId('ir-queue-7');
    await expect(row).toContainText('From MDR');
    await expect(page.getByTestId('ir-confirm-7')).toHaveCount(0);
    await row.click();
    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('ir-pane')).toBeVisible();
    await expect(right.getByTestId('ir-from-mdr')).toBeVisible();
    await expect(right.getByTestId('ir-pane')).toContainText('Sample deck screws, level 1');
    // The inspector would record, sign and send here; on a copy, nothing.
    await expect(right.getByTestId('ir-result-step')).toHaveCount(0);
    await expect(right.getByTestId('ir-generate')).toHaveCount(0);
    await expect(right.getByTestId('ir-confirm')).toHaveCount(0);
  });

  test('the calendar shows the copies on their day and in the week', async ({ page }, testInfo) => {
    await page.goto(`/p/job-b/calendar?day=${DAY}`);
    const detail = page.getByTestId('cal-day-detail');
    const card = detail.getByTestId('cal-request').filter({ has: page.getByText('IR 7', { exact: true }) });
    await expect(card).toContainText('From MDR');
    await expect(card).toContainText('Sample deck screws, level 1');
    await expect(detail.getByTestId('cal-request').filter({ has: page.getByText('IR 8', { exact: true }) })).toContainText('Not approved');
    test.skip(testInfo.project.name !== 'desktop', 'The phone shows the month.');
    await page.goto(`/p/job-b/calendar?view=week&day=${DAY}`);
    await expect(page.getByTestId(`cal-day-${DAY}`).getByTestId('cal-line').filter({ hasText: 'IR 7' })).toContainText('7:00');
  });
});
