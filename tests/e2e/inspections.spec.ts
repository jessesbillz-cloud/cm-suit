// Inspection scheduling (SPEC §13.2) against the e2e mock. The mock 'pm' holds every capability, so it is both the
// requester and the inspector here: it sends a request and gets a receipt with the IR number, confirms it from the day
// view (tap budget §7.9: 2; it takes 1) and records a result. PDFs and email are server-only and not mocked.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

interface TapWindow {
  __taps: number;
}

test.describe('inspections (SPEC §13.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
      (window as unknown as TapWindow).__taps = 0;
      document.addEventListener('click', () => {
        (window as unknown as TapWindow).__taps += 1;
      }, true);
    });
  });

  test('request -> receipt; the inspector confirms and records a result', async ({ page }) => {
    // The sample job is under construction, so Inspections is already on its rail.
    // Requester: the form is prefilled; that day is open; the receipt carries the number the database gave.
    await page.goto('/p/job-a/inspections?view=week');
    await expect(page.getByTestId('rail-inspections')).toBeVisible();
    await page.getByTestId('ir-new').click();
    await expect(page.getByTestId('ir-company')).toHaveValue('Sample Concrete Co');
    await page.getByTestId('ir-time').selectOption('09:00');
    await page.getByTestId('ir-items').fill('Sample footing rebar at grid A');
    await expect(page.getByTestId('ir-conflicts')).toContainText('Open day.');
    await expect(page.getByTestId('ir-submit')).toBeDisabled();
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText('IR 1');
    await expect(page.getByTestId('ir-receipt')).toContainText('Waiting on the inspector.');
    await expect(page.getByTestId('ir-entry').first()).toContainText('IR 1');

    // Inspector: the day's queue; Confirm is one tap.
    await page.goto('/p/job-a/inspections?view=day');
    const row = page.getByTestId('ir-queue-1');
    await expect(row).toContainText('Pending');
    await page.evaluate(() => {
      (window as unknown as TapWindow).__taps = 0;
    });
    await page.getByTestId('ir-confirm-1').click();
    await expect(row).toContainText('Confirmed');
    expect(await page.evaluate(() => (window as unknown as TapWindow).__taps)).toBeLessThanOrEqual(2);

    // Open it: record Approved, then the one-tap "No issues" note.
    await row.click();
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await pane.getByTestId('ir-result-approved').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await pane.getByTestId('ir-no-issues').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('No issues');
    await expect(row).toContainText('Approved');
    await expect(pane.getByTestId('ir-generate')).toBeVisible();
  });
});
