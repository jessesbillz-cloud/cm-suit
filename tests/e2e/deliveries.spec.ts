// Deliveries (SPEC §13.3) against the e2e mock: Sample Job A has a Sample Concrete Co delivery today 7:00-8:00.
// Posting 7:30 shows the heads-up and lands as Standby on the board; TV mode opens with its clock; the delivery link
// made in the Link view opens the public board, where a typed name posts a delivery and gets a receipt.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('deliveries (SPEC §13.3)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The post form opens in the right column of the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('an overlapping post gets the heads-up and lands as Standby', async ({ page }) => {
    await page.goto('/p/job-a/deliveries');
    const cards = page.getByTestId('delivery-day-cards');
    await expect(cards.getByTestId('delivery-card')).toHaveCount(2);

    await page.getByTestId('deliveries-post').click();
    const form = page.getByTestId('right-column').getByTestId('delivery-form');
    await form.getByTestId('delivery-company').selectOption('Sample Steel Co');
    await form.getByTestId('delivery-time').fill('07:30');
    await form.getByTestId('delivery-description').fill('Sample beams');
    await expect(form.getByTestId('delivery-heads-up')).toContainText('Heads up — Sample Concrete Co already has a delivery 7:00–8:00 AM');
    await expect(form.getByTestId('delivery-submit')).toHaveText('Post as Standby');
    await form.getByTestId('delivery-submit').click();

    const receipt = page.getByTestId('right-column').getByTestId('delivery-receipt');
    await expect(receipt.getByTestId('delivery-receipt-number')).toHaveText('#4');
    await expect(receipt).toContainText('Standby');
    const posted = cards.getByTestId('delivery-card').filter({ hasText: 'Sample Steel Co' });
    await expect(posted).toContainText('Standby');
    await expect(cards.getByTestId('delivery-card')).toHaveCount(3);
  });

  test('TV mode opens full screen with a live clock', async ({ page }) => {
    await page.goto('/p/job-a/deliveries');
    await page.getByTestId('deliveries-tv').click();
    const tv = page.getByTestId('delivery-tv');
    await expect(tv).toBeVisible();
    await expect(tv.getByTestId('delivery-tv-clock')).toHaveText(/^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
    await expect(tv.getByTestId('delivery-card')).toHaveCount(2);
    await tv.getByRole('button', { name: 'Exit' }).click();
    await expect(tv).toBeHidden();
  });

  test('the delivery link opens the public board and posts with a typed name', async ({ page }) => {
    await page.goto('/p/job-a/deliveries?view=link');
    await page.getByRole('button', { name: 'Make link' }).click();
    const url = await page.getByTestId('delivery-link-url').textContent();
    expect(url).toMatch(/\/d\/job-a\?t=[A-Za-z0-9_-]{43}$/);

    await page.goto(url ?? '');
    await expect(page.getByRole('heading', { name: 'Deliveries' })).toBeVisible();
    await page.getByTestId('deliveries-post').click();
    await page.getByTestId('delivery-name').fill('Sample Driver');
    await page.getByTestId('delivery-company').selectOption({ label: 'Other' });
    await page.getByTestId('delivery-company-other').fill('Sample Crane Rental');
    await page.getByTestId('delivery-time').fill('10:00');
    await page.getByTestId('delivery-description').fill('Sample crane mats');
    await page.getByTestId('delivery-submit').click();

    const receipt = page.getByTestId('delivery-receipt');
    await expect(receipt).toContainText('Sample Crane Rental');
    await expect(receipt).toContainText('Sample Driver');
    await expect(page.getByTestId('delivery-day-cards')).toContainText('Sample Crane Rental');
  });
});
