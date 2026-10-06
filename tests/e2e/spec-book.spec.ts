// The spec book (migration 0088) against the e2e mock: job A's project manual in Specs opens straight to full screen
// with its section bar (one list of every section with its title, previous / next section and page, the page box),
// and a requirement's section number opens the book at that section. The mock manual is the mock PDF's three pages,
// one section on each.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('spec book', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the manual opens full screen from Specs, and the bar moves by section and by page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Uses the desktop Files screen.');
    await page.goto('/p/job-a/files?folder=job-a-specs');
    await page.getByTestId('file-row-name').filter({ hasText: 'Sample Project Manual.pdf' }).click();

    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual.pdf');
    const bar = viewer.getByTestId('spec-bar');
    const section = bar.getByTestId('spec-section');
    await expect(section.locator('option')).toHaveText([
      '09 21 16\u00a0\u00a0Gypsum Board Assemblies',
      '09 29 00\u00a0\u00a0Gypsum Board',
      '10 28 00\u00a0\u00a0Toilet Accessories',
    ]);
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(bar.getByTestId('spec-prev-section')).toBeDisabled();

    await section.selectOption({ label: '10 28 00\u00a0\u00a0Toilet Accessories' });
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
    await expect(bar.getByTestId('spec-next-section')).toBeDisabled();
    await expect(bar.getByTestId('spec-next-page')).toBeDisabled();

    await bar.getByTestId('spec-prev-section').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 2 of 3');
    await expect(section).toHaveValue('1');

    await bar.getByTestId('spec-prev-page').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');

    await bar.getByTestId('spec-page').fill('3');
    await bar.getByTestId('spec-page').press('Enter');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
    await expect(section).toHaveValue('2');

    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test("a requirement's section number opens the book at that section", async ({ page }) => {
    await page.goto('/p/job-a/requirements/mock-req-ofci');
    await page.getByTestId('req-pane').getByTestId('spec-link').filter({ hasText: '10 28 00' }).click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual.pdf');
    await expect(viewer.getByTestId('spec-section')).toHaveValue('2');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
  });
});
