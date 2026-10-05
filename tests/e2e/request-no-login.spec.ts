// Inspection requests with no login (SPEC §6.4 #4, migration 0055) against the e2e mock. The mock user 'anon' is a
// visitor with no session (src/data/mock/index.ts mockSignedOut); the mock 'pm' takes requests on Sample Job A. The
// mock hands out a fixed sample request token (src/data/mock/requestLink.ts).
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOKEN = 'sample-request-token-sample-request-token-1';
const PHOTO = { name: 'Sample north wall.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(60).fill(0)]) };

test.describe('requests with no login (SPEC §6.4 #4)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    // Only the first load: a later step may sign in as the inspector.
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'anon');
    });
  });

  test('a visitor requests with a photo, gets the number and the status link; the inspector sees the contact', async ({ page }) => {
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await expect(page.getByTestId('public-job')).toHaveText('Sample Job A');
    await expect(page.getByTestId('public-day')).toBeVisible();
    await page.getByTestId('public-time').selectOption('09:00');
    await page.getByTestId('public-items').fill('Sample north wall framing, grid 4 to 8');
    await page.getByTestId('public-files-input').setInputFiles(PHOTO);
    await expect(page.getByTestId('public-files')).toContainText('Sample north wall.jpg');
    await page.getByTestId('public-name').fill('Sample Foreman');
    await page.getByTestId('public-company').fill('Sample Framing Co');
    await page.getByTestId('public-phone').fill('555 010 2030');
    await expect(page.getByTestId('public-submit')).toBeDisabled();
    await page.getByTestId('public-ack').check();
    await page.getByTestId('public-submit').click();

    // The receipt: the number the database gave, the tracker, the private status link.
    await expect(page.getByTestId('public-receipt')).toBeVisible();
    await expect(page.getByTestId('public-ir-number')).toHaveText(/^IR \d+$/);
    const number = ((await page.getByTestId('public-ir-number').textContent()) ?? '').replace('IR ', '');
    await expect(page.getByTestId('ir-tracker')).toBeVisible();
    await expect(page.getByTestId('public-ir-status')).toContainText('Waiting on the inspector.');
    await expect(page.getByTestId('public-status-url')).toContainText('/r/job-a/s/');

    // The status link: the tracker and nothing about the visitor.
    await page.getByTestId('public-status-open').click();
    await expect(page).toHaveURL(/\/r\/job-a\/s\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByTestId('public-status')).toContainText(`IR ${number}`);
    await expect(page.getByTestId('public-status')).not.toContainText('Sample Foreman');
    await expect(page.getByTestId('ir-tracker')).toBeVisible();

    // Next time on this phone: who is asking is filled in; "Not you?" empties it.
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await expect(page.getByTestId('public-name')).toHaveValue('Sample Foreman');
    await expect(page.getByTestId('public-company')).toHaveValue('Sample Framing Co');
    await expect(page.getByTestId('public-phone')).toHaveValue('555 010 2030');
    await page.getByTestId('public-not-you').click();
    await expect(page.getByTestId('public-name')).toHaveValue('');

    // The inspector sees it like any request, with "via link" and the contact (phone: the item full screen).
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await page.goto(`/p/job-a/inspections/mock-ir-${number}`);
    const via = page.getByTestId('ir-via-link');
    await expect(via).toContainText('Sample Foreman · Sample Framing Co');
    await expect(via.getByRole('link', { name: '555 010 2030' })).toHaveAttribute('href', 'tel:5550102030');
    await expect(page.getByTestId('ir-pane')).toContainText('Sample north wall framing');
  });

  test('the status link shows a postponement and, once the IR is made, View IR (0075)', async ({ page }) => {
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await page.getByTestId('public-time').selectOption('10:00');
    await page.getByTestId('public-items').fill('Sample shear wall nailing, line 3');
    await page.getByTestId('public-name').fill('Sample Foreman');
    await page.getByTestId('public-company').fill('Sample Framing Co');
    await page.getByTestId('public-phone').fill('555 010 2030');
    await page.getByTestId('public-ack').check();
    await page.getByTestId('public-submit').click();
    await expect(page.getByTestId('public-ir-number')).toHaveText(/^IR \d+$/);
    const number = ((await page.getByTestId('public-ir-number').textContent()) ?? '').replace('IR ', '');
    await page.getByTestId('public-status-open').click();
    await expect(page).toHaveURL(/\/r\/job-a\/s\/[A-Za-z0-9_-]{43}$/);
    const statusUrl = page.url();
    await expect(page.getByTestId('public-view-ir')).toHaveCount(0);

    // The inspector postpones it for the weather, with a note for the requester.
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await page.goto(`/p/job-a/inspections/mock-ir-${number}`);
    const pane = page.getByTestId('ir-pane');
    await pane.getByTestId('ir-postpone-open').click();
    await pane.getByTestId('ir-postpone-reason-weather').click();
    await pane.getByTestId('ir-postpone').getByLabel('Note').fill('Rain all day');
    await pane.getByTestId('ir-postpone').getByRole('button', { name: 'Postpone' }).click();
    await expect(pane.getByTestId('ir-postponed')).toContainText('Weather');

    // The visitor's status link says why, with the note; never the inspector.
    await page.goto(statusUrl);
    const postponed = page.getByTestId('public-ir-postponed');
    await expect(postponed).toContainText('Weather');
    await expect(postponed).toContainText('Rain all day');

    // Confirmed again, approved, the IR made: View IR on the status link.
    await page.goto(`/p/job-a/inspections/mock-ir-${number}`);
    await pane.getByTestId('ir-confirm').click();
    await pane.getByTestId('ir-result-approved').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await pane.getByTestId('ir-generate').click();
    await expect(pane.getByTestId('ir-view-ir')).toBeVisible();
    await page.goto(statusUrl);
    await expect(page.getByTestId('public-ir-result')).toContainText('Approved');
    await expect(page.getByTestId('public-view-ir')).toBeVisible();
    await expect(page.getByTestId('public-ir-postponed')).toHaveCount(0);
  });

  test('a wrong status link says so', async ({ page }) => {
    await page.goto(`/r/job-a/s/${'A'.repeat(43)}`);
    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
  });
});
