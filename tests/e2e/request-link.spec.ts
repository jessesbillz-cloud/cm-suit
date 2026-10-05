// The job's request link, the QR sheet and the all-my-jobs link (SPEC §6.4 #4, §13.2) against the e2e mock. The mock
// 'pm' runs the job and takes requests; the mock 'visitor' is on no job until they join through a link (as a requester,
// 0055; requesting with no login is request-no-login.spec.ts). The mock hands out fixed sample tokens
// (src/data/mock/requestLink.ts).
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOKEN = 'sample-request-token-sample-request-token-1';
const HUB = 'mock-hub-1';
const HUB_TOKEN = 'sample-hub-token-sample-hub-token-sample-h1';

test.describe('request link (SPEC §6.4 #4)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the job admin makes the link, prints the QR sheet and makes the all-my-jobs link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await page.goto('/p/job-a/inspections');
    await page.getByTestId('ir-share-open').click();
    await expect(page.getByTestId('request-link-state')).toHaveText('No request link');
    await page.getByTestId('request-link-make').click();
    await expect(page.getByTestId('request-link-state')).toHaveText('Request link on');
    await expect(page.getByTestId('request-link-url')).toContainText(`/r/job-a?t=${TOKEN}`);
    await page.getByTestId('request-qr').click();
    await expect(page.getByTestId('qr-sheet')).toContainText('Request an inspection');
    await expect(page.getByTestId('qr-code')).toBeVisible();
    await page.getByTestId('print-sheet').getByRole('button', { name: 'Close' }).click();

    await expect(page.getByTestId('hub-share')).toBeVisible();
    await page.getByTestId('hub-make').click();
    await expect(page.getByTestId('hub-url')).toContainText(`/h/${HUB}?t=${HUB_TOKEN}`);
  });

  test('a visitor who signs in joins as a requester and lands on the request form', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'visitor');
    });
    await page.goto(`/r/job-a?t=${TOKEN}`);
    // The default is the request with no login (0055); signing in is the secondary path.
    await expect(page.getByTestId('public-request')).toBeVisible();
    await page.getByTestId('request-signin').click();
    await expect(page.getByTestId('request-join')).toBeVisible();
    await page.getByLabel('Your name').fill('Sample Foreman');
    await page.getByLabel('Company').fill('Sample Framing Co');
    await page.getByTestId('request-join-go').click();
    await expect(page).toHaveURL(/\/p\/job-a\/inspections\/new/);
  });

  test('joining makes the requests sent earlier from that address the joiner\'s (0075)', async ({ page }) => {
    // Signed out, the visitor asks with the address they will sign in with (the mock 'visitor' is visitor@example.test).
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await page.getByTestId('public-time').selectOption('14:00');
    await page.getByTestId('public-items').fill('Sample header nailing, east wall');
    await page.getByTestId('public-name').fill('Sample Foreman');
    await page.getByTestId('public-company').fill('Sample Framing Co');
    await page.getByTestId('public-email').fill('visitor@example.test');
    await page.getByTestId('public-ack').check();
    await page.getByTestId('public-submit').click();
    await expect(page.getByTestId('public-ir-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('public-ir-number').textContent()) ?? '').replace('IR ', '');

    // Signed in, they join from the link: the request is theirs now (read in full, theirs to move or withdraw).
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'visitor');
    });
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await page.getByTestId('request-signin').click();
    await page.getByLabel('Your name').fill('Sample Foreman');
    await page.getByLabel('Company').fill('Sample Framing Co');
    await page.getByTestId('request-join-go').click();
    await expect(page).toHaveURL(/\/p\/job-a\/inspections\/new/);
    await page.goto(`/p/job-a/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    await expect(pane).toContainText('Sample header nailing, east wall');
    await expect(pane.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });

  test('a dead link says so', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'visitor');
    });
    await page.goto('/r/job-a?t=not-the-token-not-the-token-not-the-token-x');
    await expect(page.getByRole('heading', { name: 'Link not active' })).toBeVisible();
  });

  test('the all-my-jobs link lists the jobs and opens one', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'visitor');
    });
    await page.goto(`/h/${HUB}?t=${HUB_TOKEN}`);
    const jobs = page.getByTestId('hub-jobs');
    await expect(jobs.getByRole('link').first()).toBeVisible();
    await jobs.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/r/[^?]+\\?t=${HUB_TOKEN}&h=${HUB}`));
    await expect(page.getByTestId('public-request')).toBeVisible();
  });
});
