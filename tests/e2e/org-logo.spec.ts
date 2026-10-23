// A company's logo and letterhead, and the job's brand (migration 0110), against the e2e mock data layer.
// Contract with the mock: 'pm' runs "Sample Builders", the company of job-a, and manages job-a. A new company made in
// Settings > Company is one the mock user runs. The images are synthetic, made here.
// Test ids: company-logo-input / company-logo-image (each company card, in order), letterhead (data-version: the saved
// row's version) and letterhead-<field>, add-company, add-company-name, add-company-save, job-brand (Settings > Job),
// org-logo (the top bar box, data-state) and org-logo-image.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

// A 4 x 2 red PNG (synthetic).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGM4IScHRwzIHABvCgghBqXSdgAAAABJRU5ErkJggg==',
  'base64',
);
// A blue SVG (synthetic): turned into a PNG in the browser before upload.
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#1d4ed8"/></svg>',
);

test.describe('company logo, letterhead and the job brand (0110)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the letterhead saves as I go and survives a reload', async ({ page }) => {
    await page.goto('/p/job-a/settings');
    const card = page.getByTestId('letterhead').first();
    await expect(card).toHaveAttribute('data-version', '0');
    await page.getByTestId('letterhead-address').fill('1 Sample Way, Sample City');
    await page.getByTestId('letterhead-phone').click();
    await expect(card).toHaveAttribute('data-version', '1');
    await page.getByTestId('letterhead-phone').fill('(555) 010-0100');
    await page.getByTestId('letterhead-website').click();
    await expect(card).toHaveAttribute('data-version', '2');
    await page.reload();
    await expect(page.getByTestId('letterhead-address')).toHaveValue('1 Sample Way, Sample City');
    await expect(page.getByTestId('letterhead-phone')).toHaveValue('(555) 010-0100');
  });

  test('a logo uploaded in Settings shows in the top bar of that company\'s job', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The logo sits in the desktop top bar.');
    await page.goto('/p/job-a/settings');
    const box = page.getByTestId('org-logo');
    await expect(box).toHaveAttribute('data-state', 'none');
    const before = await box.boundingBox();

    await page.getByTestId('company-logo-input').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('company-logo-image').first()).toBeVisible();
    const logo = page.getByTestId('org-logo-image');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('alt', 'Sample Builders');
    // The box was reserved: the logo arriving moved nothing.
    expect(await box.boundingBox()).toEqual(before);

    // All my jobs is no job: no brand box.
    await page.goto('/all/settings');
    await expect(page.getByTestId('org-logo')).toHaveCount(0);
  });

  test('the manager shows another company of theirs on the job: its logo takes the top bar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The logo sits in the desktop top bar.');
    await page.goto('/p/job-a/settings');
    // One company: nothing to pick.
    await expect(page.getByTestId('letterhead-address')).toBeVisible();
    await expect(page.getByTestId('job-brand')).toHaveCount(0);

    await page.getByTestId('add-company').click();
    await page.getByTestId('add-company-name').fill('Sample Fire Office');
    await page.getByTestId('add-company-save').click();
    await expect(page.getByRole('heading', { name: 'Sample Fire Office' })).toBeVisible();
    await page.getByTestId('company-logo-input').nth(1).setInputFiles({ name: 'office.svg', mimeType: 'image/svg+xml', buffer: SVG });
    // Sample Builders has no logo in this test: the fire office's is the only one.
    await expect(page.getByTestId('company-logo-image')).toHaveCount(1);
    await expect(page.getByTestId('company-logo-image')).toBeVisible();

    const brand = page.getByTestId('job-brand');
    await expect(brand.locator('option')).toHaveText(['Sample Builders', 'Sample Fire Office']);
    await brand.selectOption({ label: 'Sample Fire Office' });
    await expect(page.getByTestId('org-logo-image')).toHaveAttribute('alt', 'Sample Fire Office');
    await page.reload();
    await expect(page.getByTestId('org-logo-image')).toHaveAttribute('alt', 'Sample Fire Office');
    await expect(page.getByTestId('job-brand').locator('option:checked')).toHaveText('Sample Fire Office');
  });
});
